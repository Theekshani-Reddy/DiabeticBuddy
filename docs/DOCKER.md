# PostgreSQL with Docker Compose

Start Docker Desktop, then run these commands from the project root:

```sh
docker compose up -d --wait
docker compose ps
```

Compose starts PostgreSQL 16 on `127.0.0.1:5432` and waits for its health check.
A new volume gets both `sweety` and `sweety_test` databases. The SQL init script
runs only on a new volume; app tables still come from `npm run db:migrate`.
The local credentials match `.env.example`. If you change them, update the
Compose environment and both connection URLs together. Changing environment
variables does not reset credentials in an existing PostgreSQL volume.

Use `docker compose logs db` to inspect startup and `docker compose down` to
stop/remove the container while keeping its named volume. A later `up` reuses it.
`docker compose down -v` also deletes Compose-managed data volumes; use it only
when intentionally resetting a disposable database.

## Existing database

If you already use the earlier manual container `sweety-db` with the volume
`sweety-pgdata`, stop that container to free port 5432:

```sh
docker stop sweety-db
```

Create an untracked `docker-compose.override.yml` in the project root:

```yaml
volumes:
  pgdata:
    external: true
    name: sweety-pgdata
```

Then run `docker compose up -d --wait`. It mounts the same existing volume;
accounts, readings, and migrations remain available. Keep the old container
stopped while Compose uses this volume. External volumes survive `down -v` too.
If this older volume has no test database, create it once with
`docker compose exec db createdb -U sweety sweety_test`.

To return to the manual container, run `docker compose down`, then
`docker start sweety-db`. The shared data volume is retained.
