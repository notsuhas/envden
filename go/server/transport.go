package server

import (
	"bytes"
	"net"
)

type compatibleListener struct{ net.Listener }

func (l compatibleListener) Accept() (net.Conn, error) {
	conn, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}

	return &compatibleConnection{Conn: conn}, nil
}

type compatibleConnection struct{ net.Conn }

var parserFailure = []byte("HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n")

func (c *compatibleConnection) Write(data []byte) (int, error) {
	if bytes.HasPrefix(data, parserFailure) {
		if _, err := c.Conn.Write([]byte("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")); err != nil {
			return 0, err
		}

		return len(data), nil
	}

	return c.Conn.Write(data)
}
