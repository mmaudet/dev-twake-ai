# Users on dev-twake.maudet.cloud

Each user gets a dedicated Cozy instance with the standard apps + the local
`twakespace` webapp pre-installed. Provisioned via
[`scripts/provision-user.sh`](scripts/provision-user.sh).

| Slug       | Public name | Email                  | Instance                                          | Provisioned  |
|------------|-------------|------------------------|---------------------------------------------------|--------------|
| mmaudet    | Michel      | michel.maudet@gmail.com| https://mmaudet.dev-twake.maudet.cloud/           | 2026-05-28   |
| bandre     | Benjamin    | bandre@linagora.com    | https://bandre.dev-twake.maudet.cloud/            | 2026-05-28   |
| qvalmori   | qvalmori    | qvalmori@linagora.com  | https://qvalmori.dev-twake.maudet.cloud/          | 2026-05-28   |
| zbellot    | Zoé         | zbellot@linagora.com   | https://zbellot.dev-twake.maudet.cloud/           | 2026-05-28   |
| dpotokina  | Diana       | dpotokina@linagora.com | https://dpotokina.dev-twake.maudet.cloud/         | 2026-05-28   |

## Add a new user

```sh
scripts/provision-user.sh <slug> "<Public Name>" <email>
```

This creates the instance, installs `twakespace`, and emails the user the
registration link from `mmaudet@linagora.com` via `smtp.linagora.com`.
