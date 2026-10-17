# LAN CI runner

Sitegeist CI runs on the `tower.lan` self-hosted Linux x64 runner with labels
`self-hosted`, `linux`, `x64`, and `sitegeist`. Its container is
`github-runner-sitegeist`, using the `tower-actions-runner:2026-10-17` image
and persistent home volume `github-runner-sitegeist-home`.

The runner image provides Node.js 22, GitHub CLI (`gh`), `zip`, and native
build dependencies needed by the extension and its sibling packages. The
workflow checks out the repository and its public `badlogic/mini-lit` and
`badlogic/pi-mono` dependencies into separate directories under `source/`.

Pull requests from the repository owner run validation; fork pull requests are
skipped because this runner is inside the LAN. Manual dispatch builds and
packages the extension without publishing. A push of a `v*` tag retains the
release flow: it extracts the built version and changelog, then creates a
GitHub Release with `sitegeist.zip` attached.

Actions cache inputs and hosted Actions artifact storage are not used. Release
archives remain GitHub Release assets.
