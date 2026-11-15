package server

import (
	"github.com/notsuhas/envden/go/core/errors"
)

type ErrorResponse struct {
	Error   errors.Code `json:"error"`
	Message string      `json:"message"`
}

func ErrorStatus(code errors.Code) int {
	switch code {
	case errors.InvalidInput, errors.InvalidData, errors.RecoveryKitRequired:
		return 400
	case errors.Unauthorized, errors.NotMember, errors.Locked:
		return 403
	case errors.NotFound:
		return 404
	case errors.UpdateRequired, errors.ServerTooOld, errors.ClientTooOld:
		return 426
	case errors.NotImplemented:
		return 501
	case errors.ServerUnreachable, errors.RateLimited, errors.StorageQuota, errors.Moving, errors.Busy:
		return 502
	case errors.Internal:
		return 500
	default:
		return 409
	}
}

func ErrorBody(err error) ErrorResponse {
	if e, ok := errors.As(err); ok {
		return ErrorResponse{e.Code, e.Message}
	}

	return ErrorResponse{errors.Internal, "envden ui hit an internal error"}
}
