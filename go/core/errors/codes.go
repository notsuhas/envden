package errors

// Code names a failure class; the CLI maps it to an exit code and the server to a status.
type Code string

const (
	InvalidInput        Code = "INVALID_INPUT"
	InvalidData         Code = "INVALID_DATA"
	UpdateRequired      Code = "UPDATE_REQUIRED"
	Rollback            Code = "ROLLBACK"
	Fork                Code = "FORK"
	NotMember           Code = "NOT_MEMBER"
	Unauthorized        Code = "UNAUTHORIZED"
	Locked              Code = "LOCKED"
	RecoveryKitRequired Code = "RECOVERY_KIT_REQUIRED"
	StorageQuota        Code = "STORAGE_QUOTA"
	RateLimited         Code = "RATE_LIMITED"
	Conflict            Code = "CONFLICT"
	NotFound            Code = "NOT_FOUND"
	HeadMoved           Code = "HEAD_MOVED"
	RestoredMode        Code = "RESTORED_MODE"
	Moving              Code = "MOVING"
	ServerTooOld        Code = "SERVER_TOO_OLD"
	ClientTooOld        Code = "CLIENT_TOO_OLD"
	NotImplemented      Code = "NOT_IMPLEMENTED"
	Internal            Code = "INTERNAL"
	ServerUnreachable   Code = "SERVER_UNREACHABLE"
	Busy                Code = "BUSY"
)

var codes = []Code{
	InvalidInput, InvalidData, UpdateRequired, Rollback, Fork, NotMember, Unauthorized, Locked,
	RecoveryKitRequired, StorageQuota, RateLimited, Conflict, NotFound, HeadMoved, RestoredMode,
	Moving, ServerTooOld, ClientTooOld, NotImplemented, Internal, ServerUnreachable, Busy,
}

// ParseCode reports whether text is a known code, as the TS ErrorCodeSchema does.
func ParseCode(text string) (Code, bool) {
	for _, code := range codes {
		if string(code) == text {
			return code, true
		}
	}

	return "", false
}
