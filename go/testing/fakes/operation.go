package fakes

func Unexpected(operation string) { panic("Unexpected fake operation: " + operation) }
