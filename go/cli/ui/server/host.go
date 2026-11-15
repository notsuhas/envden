package server

import "strconv"

func AllowedHost(host string, port int) bool {
	suffix := ":" + strconv.Itoa(port)
	return host == "127.0.0.1"+suffix || host == "localhost"+suffix
}

func SameOrigin(origin, host string) bool {
	return origin != "" && host != "" && origin == "http://"+host
}
