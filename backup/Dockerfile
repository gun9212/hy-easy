# Daily database backup job (Cloud Run Job). pg_dump must be at least the server's major version (Supabase: 17).
FROM postgres:17-alpine
RUN apk add --no-cache curl jq tzdata
COPY run.sh /usr/local/bin/backup
RUN chmod 0755 /usr/local/bin/backup
USER postgres
ENTRYPOINT ["/usr/local/bin/backup"]
