#!/usr/bin/env bash
#
# Snapshot setup for Cursor cloud agent (Ubuntu amd64)
# Uses apt-get for system deps, mirroring the production Dockerfile approach
#
# Cursor redirects ssh traffic to https so it can use its PAT - until that configuration is fixed:
#   ssh-keygen -t rsa -b 4096
#   eval "$(ssh-agent -s)"
#   ssh-add ~/.ssh/id_rsa
#   cat ~/.ssh/id_rsa.pub # Make sure it's .pub!
# Go to https://github.com/settings/keys and add the key, then cache the talkbox repo
#   git clone ssh://git@ssh.github.com:443/powerhome/talkbox.git /workspace/vendor/bundle/ruby/3.3.0/cache/bundler/git/talkbox-16059c5b3a2eda419b6fdab54d42b2809b6a4961 --bare --no-hardlinks --no-tags --single-branch
#
set -Eeo pipefail
trap "echo 'Setup failed'" ERR

echo "=== Cursor Cloud Agent Snapshot Setup ==="

export NITRO_GIS_ENABLED=false
echo 'export NITRO_GIS_ENABLED=false' >> ~/.bashrc

echo "Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  procps \
  curl \
  file \
  git \
  autoconf \
  pkg-config \
  coreutils \
  ghostscript \
  imagemagick \
  libpq-dev \
  sqlite3 \
  libsqlite3-dev \
  libssl-dev \
  shared-mime-info \
  libreadline-dev \
  libyaml-dev \
  libgmp-dev \
  freetds-dev \
  pdftk-java \
  gnupg

echo "Installing MySQL client..."
MYSQL_COMMUNITY_CLIENT_VERSION=8.0.45-1ubuntu24.04
MYSQL_SHELL_VERSION=8.0.45-1ubuntu24.04
MYSQL_GPGKEY=A8D3785C
gpg --import config/container/mysql/signing-keys/${MYSQL_GPGKEY}.asc
gpg --export ${MYSQL_GPGKEY} | sudo gpg --dearmor -o /usr/share/keyrings/mysql.gpg
echo 'deb [signed-by=/usr/share/keyrings/mysql.gpg] http://repo.mysql.com/apt/ubuntu/ noble mysql-8.0' | sudo tee /etc/apt/sources.list.d/mysql.list
# Install percona-toolkit
curl -O https://repo.percona.com/apt/percona-release_1.0-27.generic_all.deb
sudo dpkg -i percona-release_1.0-27.generic_all.deb
rm percona-release_1.0-27.generic_all.deb
# Install mysql tooling
sudo apt-get update
sudo apt-get install -y \
  mysql-community-client="${MYSQL_COMMUNITY_CLIENT_VERSION}" \
  mysql-shell="${MYSQL_SHELL_VERSION}" \
  libmysqlclient-dev \
  percona-toolkit

echo "Installing asdf..."
if [[ ! -d "$HOME/.asdf" ]]; then
  git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0
fi
export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"
echo 'export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"' >> ~/.bashrc

echo "Installing asdf plugins..."
asdf plugin list | grep -q ruby || asdf plugin add ruby
asdf plugin list | grep -q nodejs || asdf plugin add nodejs
asdf plugin list | grep -q yarn || asdf plugin add yarn

echo "Installing Ruby, Node, Yarn via asdf..."
asdf install ruby
asdf install nodejs
asdf install yarn

echo "Installing bundler..."
gem install bundler -v 2.7.2

echo "Configuring bundler..."
bundle config --local path "$PWD/vendor/bundle"

echo "Setting up Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi

# Start containerd and Docker daemon
if ! sudo docker info &>/dev/null; then
  echo "Starting containerd..."
  sudo containerd &>/dev/null &
  sleep 2

  echo "Starting Docker daemon..."
  sudo dockerd --iptables=false --storage-driver=vfs &>/dev/null &
  sleep 3
fi

echo "Starting datastores..."
sudo docker compose --profile test up -d

echo "Waiting for MySQL..."
until sudo docker compose exec -T db mysql -u root -ptalkbox -e "SELECT 1" &>/dev/null; do
  sleep 2
done
echo "MySQL ready."

echo "Installing library dependencies..."
#./install.sh
# Just install gems for now - need VPN access for npm registry
mkdir -p "$(dirname "$0")/vendor/bundle"
    export BUNDLE_PATH=${BUNDLE_TO:-$(cd "$(dirname "$0")/vendor/bundle"; pwd)}
    bundle check || bundle install

echo "Configuring application..."
./bin/symlink-config-files.sh -f

echo "Setting up test database..."
./bin/schema

. ~/.bashrc

echo "=== Snapshot setup complete ==="
echo ""
echo "To run tests:"
echo "  bin/cobra cmd component deps --no-interactive"
echo "  bin/cobra cmd component schema --no-interactive"
echo "  cd components/component"
echo "  bundle install"
echo "  bin/rspec spec/path/to_spec.rb"
