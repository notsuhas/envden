class Envden < Formula
  desc "Self-hosted encrypted environment sync"
  homepage "https://envden.theclau.de"
  version "{{VERSION}}"
  license "MIT"
  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/notsuhas/envden/releases/download/v#{version}/envden-darwin-arm64"
      sha256 "{{SHA256_DARWIN_ARM64}}"
    else
      url "https://github.com/notsuhas/envden/releases/download/v#{version}/envden-darwin-x64"
      sha256 "{{SHA256_DARWIN_X64}}"
    end
  end
  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/notsuhas/envden/releases/download/v#{version}/envden-linux-arm64"
      sha256 "{{SHA256_LINUX_ARM64}}"
    else
      url "https://github.com/notsuhas/envden/releases/download/v#{version}/envden-linux-x64"
      sha256 "{{SHA256_LINUX_X64}}"
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
