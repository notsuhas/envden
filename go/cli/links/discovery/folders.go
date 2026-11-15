package discovery

import "strings"

type FolderPlace struct{ Home, Project bool }

func contains(names []string, name string) bool {
	for _, n := range names {
		if n == name {
			return true
		}
	}
	return false
}

func SkippedFolder(name string, place FolderPlace) bool {
	return strings.HasPrefix(name, ".") || contains([]string{"node_modules", "bower_components", "Pods", "Carthage", "DerivedData", "venv", "__pycache__"}, name) || place.Home && contains([]string{"Library", "Applications", "Pictures", "Music", "Movies", "AppData", "snap", "go", "miniconda3", "anaconda3"}, name) || place.Project && contains([]string{"target", "build", "dist", "vendor", "third_party"}, name)
}

func ProjectFolder(names []string) bool {
	for _, n := range names {
		if contains([]string{".git", "package.json", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "pyproject.toml", "composer.json", "Gemfile", "Package.swift", "CMakeLists.txt", "Makefile"}, n) {
			return true
		}
	}
	return false
}
