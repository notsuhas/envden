package adapters

import "testing"

func TestEnvPatternGrammar(t *testing.T) {
	for pattern, supported := range map[string]bool{
		".env": true, ".env.*": true, ".env*": true, ".envrc": true, "*.example": true, "*.local": true, "secrets.*": true, "*": true,
		"**/.env": true, "apps/*/.env": true, "{apps,packages}/**/.env": true, "!.env.example": true, "!**/.env.example": true,
		"config/.env.?": true, ".env.{local,development,production}": true, ".env.{local,*}": true,
		"!!.env": false, ".env.[a-z]*": false, ".env\\*": false, ".env**": false, "a/**b": false, "{a,{b,c}}": false, "{a,}": false,
		"*{a,*}": false, ".env.{a..c}": false, "+(.env)": false, "a,b": false, "a}b": false, "a//b": false, "/.env": false,
		".env.é": false, ".env.{a,b}{a,b}{a,b}{a,b}{a,b}": false, "*{a}**/**/*": false, "apps[/]web/.env": false, "apps/{*,**}": false,
	} {
		if got := !UnsupportedEnvPattern(pattern); got != supported {
			t.Errorf("%q: supported %v", pattern, got)
		}
	}
}
