package server

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"strings"
)

func NewToken() string { return base64.RawURLEncoding.EncodeToString(randBytes()) }

func randBytes() []byte {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		panic(err)
	}
	return value
}

func TokenMatches(authorization, token string) bool {
	presented := ""
	if strings.HasPrefix(authorization, "Bearer ") {
		presented = strings.TrimPrefix(authorization, "Bearer ")
	}
	return subtle.ConstantTimeCompare([]byte(presented), []byte(token)) == 1
}
