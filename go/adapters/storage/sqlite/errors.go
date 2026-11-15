package sqlite

type storageFailure string

func (err storageFailure) Error() string { return string(err) }
