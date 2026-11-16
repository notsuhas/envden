package crypto

import (
	"encoding/hex"
	"testing"
)

func TestReviewTorsionedR(t *testing.T) {
	pub, _ := hex.DecodeString("ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c")
	sig, _ := hex.DecodeString("1dd960b291c53514fece1341fc0dcd8a648b3934c2c533666f737a654ff1e1bf700d880182d83b3614903dc55b55efe82a0ea32b1a69dd9cc17d73605f3aa600")
	if !Verify(pub, "request", []byte{1, 2, 3}, sig).OK {
		t.Fatal("rejected noble signature")
	}
}
