
## apps/cli/src/vault/genesis.ts :: callback@37

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.sealWrap(epochKey, vaultId, 1, member.id, member.encPub)
```

## apps/cli/src/vault/genesis.ts :: callback@42

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.compare(a.recipient, b.recipient)
```

## apps/cli/src/vault/history.ts :: callback@36

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), binary(value))
```

## apps/cli/src/vault/history.ts :: callback@40

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value))
```

## apps/cli/src/vault/history.ts :: callback@195

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.seq === stored.seq
```

## apps/cli/src/vault/named.ts :: callback@6

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
member.name
```

## apps/cli/src/vault/join/validation.ts :: callback@9

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), hash)
```

## apps/cli/src/vault/join/validation.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.seq <= header.body.listSeq
```

## apps/cli/src/vault/join/validation.ts :: callback@41

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(checkpoint))
```

## apps/cli/src/vault/join/validation.ts :: callback@65

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), hash)
```

## apps/cli/src/vault/join/advance.ts :: callback@27

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
0
```

## apps/cli/src/vault/join/accept.ts :: callback@80

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.seq <= header.body.seq
```

## apps/cli/src/vault/join/accept.ts :: callback@81

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.encode(p.signedCodec(p.ManifestHeaderCodec), item))
```

## apps/cli/src/vault/join/accept.ts :: callback@84

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.seq <= header.body.listSeq
```

## apps/cli/src/vault/join/accept.ts :: callback@85

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.encode(p.signedCodec(p.EntryCodec), item))
```

## apps/cli/src/vault/join/accept.ts :: callback@98

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedacceptJoin(...args)
```

## apps/cli/src/vault/join/material.ts :: callback@14

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value))
```

## apps/cli/src/vault/join/material.ts :: callback@18

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(state.checkpoint!))
```

## apps/cli/src/vault/join/material.ts :: callback@22

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), binary(value))
```

## apps/cli/src/vault/join/material.ts :: callback@31

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.seq <= header.body.listSeq
```

## apps/cli/src/vault/join/material.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
[item.epoch, item.key]
```

## apps/cli/src/vault/initial/push.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.compare(a.fileId, b.fileId)
```

## apps/cli/src/vault/initial/push.ts :: callback@87

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptPushInitialFiles(...args))
```

## apps/cli/src/vault/initial/push.ts :: callback@87

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptPushInitialFiles(...args)
```

## apps/cli/src/vault/initial/entries.ts :: callback@25

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root === link.root
```

## apps/cli/src/vault/initial/entries.ts :: callback@43

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(item.fileId, fileId)
```

## apps/cli/src/vault/initial/resume.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!link.localOnly &&
      link.path === name.path &&
      state.approved.some(
        (checkout) =>
          checkout.root === link.root &&
          (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId,
      )
```

## apps/cli/src/vault/initial/resume.ts :: callback@52

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
checkout.root === link.root &&
          (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId
```

## apps/cli/src/vault/recovery/read.ts :: callback@16

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    throw new EnvdenError("INVALID_INPUT", "Can't read the recovery kit file", { cause });
  }
```

## apps/cli/src/vault/recovery/output.ts :: callback@6

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    throw new EnvdenError(
      "INVALID_INPUT",
      "Cannot create recovery kit; choose a new --kit-out path in an existing directory",
      { cause },
    );
  }
```

## apps/cli/src/vault/recovery/input.ts :: callback@6

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!vaultIdProblem(value)
```

## apps/cli/src/vault/recovery/input.ts :: callback@7

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!secretKeyProblem(value)
```

## apps/cli/src/vault/recovery/input.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decodeSecretKey(text.trim())
```

## apps/cli/src/vault/recovery/input.ts :: callback@25

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.unbase32(text.trim())
```

## apps/cli/src/vault/recovery/pdf/report.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
undefined
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: callback@73

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
({
    ...field,
    size: fitSize(field.value, fonts.code, field.large ? 18 : 12, inner),
  })
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: callback@78

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
sum + 9 + 8 + row.size
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: callback@110

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
fonts.regular.widthOfTextAtSize(part, 11)
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: callback@146

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
(supported.has(char.codePointAt(0)!) ? char : "?")
```

## apps/cli/src/vault/recovery/pdf/folder.ts :: callback@7

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
undefined
```

## apps/cli/src/vault/recovery/pdf/save.ts :: callback@23

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
undefined
```

## apps/cli/src/vault/recovery/key.ts :: callback@15

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
byte === 0
```

## apps/cli/src/vault/recovery/key.ts :: callback@16

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), envelope.checkpoint)
```

## apps/cli/src/vault/recovery/key.ts :: callback@28

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(value.recipient, recovery.id)
```

## apps/cli/src/vault/recovery/pending-kit.ts :: callback@64

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
options.onKit?.({ ...kit, masterPassword: BLANK_PASSWORD })
```

## apps/cli/src/vault/recovery/pending-kit.ts :: callback@66

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    throw new EnvdenError("RECOVERY_KIT_REQUIRED", LOST_KIT, { cause });
  }
```

## apps/cli/src/vault/recovery/resume.ts :: callback@23

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
h.body.op === 3 && p.equal(h.body.signer, identity.record.id)
```

## apps/cli/src/vault/recovery/kit.ts :: callback@35

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      if (cause instanceof EnvdenError) throw cause;

      throw new EnvdenError("INVALID_DATA", "Invalid recovery envelope", { cause });
    }
```

## apps/cli/src/vault/recovery/kit.ts :: callback@89

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptKitJoin(...args)
```

## apps/cli/src/vault/recovery/kit.ts :: callback@93

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedkitJoin(...args)
```

## apps/cli/src/vault/setup.ts :: callback@60

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.encode(p.signedCodec(p.EntryCodec), entry))
```

## apps/cli/src/vault/setup.ts :: callback@74

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.tokenProof("setup", p.tokenKey("setup", token.secret), request)
```

## apps/cli/src/vault/setup.ts :: callback@116

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedsetupVault(...args)
```

## apps/cli/src/vault/setup.ts :: callback@162

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.tokenProof("setup", p.tokenKey("setup", token.secret), request)
```

## apps/cli/src/vault/setup.ts :: callback@192

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.kind === 3
```

## apps/cli/src/vault/keys/wrap.ts :: callback@15

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(item.recipient, recipient)
```

## apps/cli/src/admin/move/switch.ts :: callback@36

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.kind === 5
```

## apps/cli/src/admin/move/switch.ts :: callback@51

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedswitchServer(...args)
```

## apps/cli/src/admin/move/abort.ts :: callback@58

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedabortMove(...args)
```

## apps/cli/src/admin/move/follow.ts :: callback@21

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.kind === 5
```

## apps/cli/src/admin/move/follow.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(h.body.listHead, p.objectHash(p.EntryCodec, moved, "entry"))
```

## apps/cli/src/admin/move/follow.ts :: callback@64

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.signedCodec(p.ManifestHeaderCodec).write(h))
```

## apps/cli/src/admin/move/resume.ts :: callback@11

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body.kind === 5
```

## apps/cli/src/admin/move/run.ts :: callback@66

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.tokenProof("setup", p.tokenKey("setup", token.secret), request)
```

## apps/cli/src/admin/move/run.ts :: callback@91

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedmoveServer(...args)
```

## apps/cli/src/admin/rejoin/classify.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(h))
```

## apps/cli/src/admin/rejoin/classify.ts :: callback@22

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), binary(e))
```

## apps/cli/src/admin/recovery/reset.ts :: callback@25

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.signSKProof(secret, request.vaultId, request)
```

## apps/cli/src/admin/recovery/reset.ts :: callback@68

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptResetPassword(...args))
```

## apps/cli/src/admin/recovery/reset.ts :: callback@68

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptResetPassword(...args)
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@139

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    const keys = p.generateRecoveryKeys();
    const secret = p.randomBytes(16);
    let shown = false;

    const show = async (kit: IReplacementKit) => {
      if (shown) return;
      await onKit(kit);
      shown = true;
    };

    try {
      return await retryHead(() =>
        attemptReplaceKit(adapters, password, now, fetcher, { keys, secret, show }, removed),
      );
    } finally {
      keys.encSk.fill(0);
      keys.objSk.fill(0);
      secret.fill(0);
    }
  }
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@144

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      if (shown) return;
      await onKit(kit);
      shown = true;
    }
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@151

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptReplaceKit(adapters, password, now, fetcher, { keys, secret, show }, removed)
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@163

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptChangePassword(...args))
```

## apps/cli/src/admin/recovery/credentials.ts :: callback@163

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptChangePassword(...args)
```

## apps/cli/src/admin/shared/history.ts :: callback@10

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
[header.body.seq, header]
```

## apps/cli/src/admin/shared/epoch.ts :: callback@17

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!removed || !p.equal(device.id, removed)
```

## apps/cli/src/admin/shared/epoch.ts :: callback@21

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.sealWrap(nextKey, context.vaultId, epoch, member.id, member.encPub)
```

## apps/cli/src/admin/shared/epoch.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.compare(a.recipient, b.recipient)
```

## apps/cli/src/admin/shared/transfer.ts :: callback@39

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
e.body.seq > listSeq && e.body.seq <= header.body.listSeq
```

## apps/cli/src/admin/shared/transfer.ts :: callback@69

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
optionalObject(source, `/v1/files/${text(hash)}`)
```

## apps/cli/src/admin/shared/material.ts :: callback@45

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
[item.epoch, item.key] as const
```

## apps/cli/src/admin/repair/finish.ts :: callback@52

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
d.name
```

## apps/cli/src/admin/repair/finish.ts :: callback@78

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptFinishRepair(...args))
```

## apps/cli/src/admin/repair/finish.ts :: callback@78

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptFinishRepair(...args)
```

## apps/cli/src/admin/repair/drop.ts :: callback@13

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
d.name === name || p.base32(d.id) === name
```

## apps/cli/src/admin/repair/completion/reports.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      const result = decodeServerObject({
        received: binary(r),
        codec: p.RepairReportCodec,
        label: "repair-report",
        mismatch: "fork",
        members: [...history.state.devices.values()],
        currentVersion: VERSION,
        latestVersion: context.local.latest ?? VERSION,
      });

      if (result.kind === "known") return [result.value];

      if (result.kind === "update-required")
        throw new EnvdenError("UPDATE_REQUIRED", "Update envden to read server data");

      if (result.kind === "unreadable")
        throw new EnvdenError("INVALID_DATA", "Unreadable data from server");

      return [];
    }
```

## apps/cli/src/admin/repair/completion/reports.ts :: callback@43

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.base32(p.objectHash(p.ManifestHeaderCodec, h, "manifest"))
```

## apps/cli/src/admin/repair/completion/names.ts :: callback@15

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
[e.epoch, e.key] as const
```

## apps/cli/src/admin/repair/completion/names.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.openFileName(entry.name, keys.get(entry.epoch)!, ring.idKey, {
      vaultId: context.vaultId,
      epoch: entry.epoch,
      fileId: entry.fileId,
      version: entry.version,
    })
```

## apps/cli/src/admin/repair/completion/close.ts :: callback@21

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), binary(status.restoredHead))
```

## apps/cli/src/admin/repair/completion/close.ts :: callback@32

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
evidence === text(p.objectHash(p.ManifestHeaderCodec, h, "manifest"))
```

## apps/cli/src/admin/repair/completion/close.ts :: callback@38

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
h.body
```

## apps/cli/src/admin/repair/lost.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      const bytes = await optionalObject(
        context.client,
        `/v1/files/${text(header.body.filesHash)}`,
      );

      if (bytes && !p.equal(p.H("files", bytes), header.body.filesHash))
        throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

      return { header: header.body, files: bytes ? p.decode(p.FilesCodec, bytes) : undefined };
    }
```

## apps/cli/src/admin/repair/lost.ts :: callback@39

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(e.fileId)
```

## apps/cli/src/admin/repair/chain.ts :: callback@5

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), new Uint8Array(Buffer.from(value, "base64url")))
```

## apps/cli/src/admin/repair/upload.ts :: callback@35

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.tokenProof("repair", p.tokenKey("repair", token.secret), request)
```

## apps/cli/src/admin/repair/upload.ts :: callback@60

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value))
```

## apps/cli/src/admin/repair/upload.ts :: callback@83

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.signedCodec(p.ManifestHeaderCodec).write(h))
```

## apps/cli/src/admin/repair/upload.ts :: callback@98

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
        if (context.local.files && p.equal(p.H("files", binary(context.local.files)), hash))
          return binary(context.local.files);

        return cachedBytes(join(adapters.home, "state", "file-lists", text(hash)));
      }
```

## apps/cli/src/admin/repair/upload.ts :: callback@168

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockeduploadRepair(...args)
```

## apps/cli/src/admin/repair/resume.ts :: callback@71

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), close.payload.restoredHead)
```

## apps/cli/src/admin/repair/resume.ts :: callback@83

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
h.body.seq < swap.header.body.seq
```

## apps/cli/src/admin/repair/resume.ts :: callback@84

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
h.body
```

## apps/cli/src/admin/devices/rotate.ts :: callback@45

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptRotateVault(...args))
```

## apps/cli/src/admin/devices/rotate.ts :: callback@45

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptRotateVault(...args)
```

## apps/cli/src/admin/devices/recovery-holders.ts :: callback@20

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.body.kind === 0
          ? p.equal(item.body.payload.device.id, entry.signer)
          : item.body.kind === 1 && p.equal(item.body.payload.device.id, entry.signer)
```

## apps/cli/src/admin/devices/remove.ts :: callback@51

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptRemoveDevice(...args))
```

## apps/cli/src/admin/devices/remove.ts :: callback@51

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptRemoveDevice(...args)
```

## apps/cli/src/admin/devices/remove.ts :: callback@86

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.name === name || p.base32(item.id) === name
```

## apps/cli/src/admin/devices/exposure.ts :: callback@37

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
({
      repoId: name.repoId,
      path: name.path,
      keys: [...name.keys].sort(),
    })
```

## apps/cli/src/admin/devices/rename.ts :: callback@19

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
device.name === name
```

## apps/cli/src/admin/devices/rename.ts :: callback@65

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
retryHead(() => attemptRenameDevice(...args))
```

## apps/cli/src/admin/devices/rename.ts :: callback@65

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
attemptRenameDevice(...args)
```

## apps/cli/src/admin/devices/list.ts :: callback@22

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
({
    id: p.base32(device.id),
    name: device.name,
    clientVersion: seen.find((item) => item.id === text(device.id))?.clientVersion ?? null,
    unconfirmed: !seen.find((item) => item.id === text(device.id))?.confirmed,
    recoveryKeyHeld: holders.has(p.base32(device.id)),
    current: p.equal(device.id, context.identity.record.id),
  })
```

## apps/cli/src/admin/devices/list.ts :: callback@25

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.id === text(device.id)
```

## apps/cli/src/admin/devices/list.ts :: callback@26

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.id === text(device.id)
```

## apps/cli/src/notice/offers.ts :: callback@24

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
!state.approved.some((item) => item.root === root)
```

## apps/cli/src/notice/offers.ts :: callback@24

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root === root
```

## apps/cli/src/notice/offers.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
undefined
```

## apps/cli/src/notice/offers.ts :: callback@50

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root === checkout.root
```

## apps/cli/src/notice/offers.ts :: callback@71

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
now - entry[1] < millisecondsInMinute
```

## apps/cli/src/notice/offers.ts :: callback@72

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
b[1] - a[1]
```

## apps/cli/src/notice/pending.ts :: callback@13

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
typeof name !== "string"
```

## apps/cli/src/notice/cache.ts :: callback@22

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root === link.root
```

## apps/cli/src/notice/cache.ts :: callback@27

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
({ repoId, status: "local changes" })
```

## apps/cli/src/notice/cache.ts :: callback@37

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.root
```

## apps/cli/src/notice/cache.ts :: callback@38

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
sanitizeTerminal(root) === root && !/[\r\n]/.test(root)
```

## apps/cli/src/notice/cache.ts :: callback@43

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
(await caseInsensitive(root).catch(() => false)) ? root : undefined
```

## apps/cli/src/notice/cache.ts :: callback@44

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
false
```

## apps/cli/src/notice/cache.ts :: callback@50

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
root !== undefined
```

## apps/cli/src/notice/cache.ts :: callback@56

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.repoId
```

## apps/cli/src/notice/cache.ts :: callback@60

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
`envden: ${sanitizeTerminal(repoId)} out of sync`
```

## apps/cli/src/notice/cache.ts :: callback@74

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedrefreshNotice(...args)
```

## apps/cli/src/notice/remote.ts :: callback@27

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    await writeRemoteNotice(
      adapters.home,
      { checkedAt: result.checkedAt, repos: result.repos },
      adapters.now,
    );

    await addPendingJoins(
      adapters.home,
      context.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
      context.identity.record.id,
      adapters.now,
    );
  }
```

## apps/cli/src/notice/remote.ts :: callback@36

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
text(p.signedCodec(p.EntryCodec).write(entry))
```

## apps/cli/src/notice/remote.ts :: callback@48

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
writeRemoteNotice(
      context.adapters.home,
      { checkedAt: result.checkedAt, repos: result.repos },
      context.options.now,
    )
```

## apps/cli/src/notice/remote.ts :: callback@62

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
context.state.aliases[item.repoId] ?? item.repoId
```

## apps/cli/src/notice/remote.ts :: callback@79

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
file.repoId
```

## apps/cli/src/notice/recovery.ts :: callback@9

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
p.decode(p.signedCodec(p.EntryCodec), binary(value))
```

## apps/cli/src/notice/recovery.ts :: callback@10

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
entry.body
```

## apps/cli/src/notice/recovery.ts :: callback@16

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
(entry.kind === 0 || entry.kind === 1) &&
        ownId !== undefined &&
        p.equal(entry.payload.device.id, ownId)
```

## apps/cli/src/notice/command.ts :: callback@33

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
adapters.repo.caseInsensitive(root, true)
```

## apps/cli/src/notice/command.ts :: callback@44

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
item.repoId
```

## apps/cli/src/notice/command.ts :: callback@45

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
repo !== currentRepo
```

## apps/cli/src/notice/command.ts :: callback@63

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
reportPendingJoins(adapters.home, adapters.now)
```

## apps/cli/src/notice/command.ts :: callback@73

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
lockedcommandNotice(adapters, now, refresh, cwd)
```

## apps/cli/src/notice/command.ts :: callback@92

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
now
```

## apps/cli/src/notice/command.ts :: callback@104

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
resolve(cwd) === item.root || resolve(cwd).startsWith(item.root + sep)
```

## apps/cli/src/notice/fetch.ts :: callback@8

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
    const signal = init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
    signal.throwIfAborted();
    let abort = () => {};

    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });

    try {
      return await Promise.race([fetcher(input, { ...init, signal }), cancelled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
```

## apps/cli/src/notice/fetch.ts :: callback@11

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{}
```

## apps/cli/src/notice/fetch.ts :: callback@13

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
{
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    }
```

## apps/cli/src/notice/fetch.ts :: callback@14

DONE comparison: callback steps were traced with the enclosing function. Any enclosing-function gap remains recorded in observations.md.

```ts
reject(signal.reason)
```
