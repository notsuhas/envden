class Envden < Formula
  desc "Self-hosted encrypted environment sync"
  homepage "https://envden.theclau.de"
  version "0.1.0"
  license "MIT"
  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/notsuhas/envden/releases/download/v#{version}/envden-darwin-arm64"
      sha256 "REPLACE_DARWIN_ARM64_SHA256"
    else
      url "https://github.com/notsuhas/envden/releases/download/v#{version}/envden-darwin-x64"
      sha256 "REPLACE_DARWIN_X64_SHA256"
    end
  end
  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/notsuhas/envden/releases/download/v#{version}/envden-linux-arm64"
      sha256 "REPLACE_LINUX_ARM64_SHA256"
    else
      url "https://github.com/notsuhas/envden/releases/download/v#{version}/envden-linux-x64"
      sha256 "REPLACE_LINUX_X64_SHA256"
    end
  end
  def install
    bin.install Dir["envden-*"].first => "envden"
  end
  def caveats
    "Run with ENVDEN_INSTALL_METHOD=brew so envden update uses Homebrew."
  end
  test do
    system bin/"envden", "--version"
  end
end
