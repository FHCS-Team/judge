FROM postgres:14-alpine

# Set timezone
ENV TZ=UTC

# PostgreSQL environment
ENV POSTGRES_DB=hackathon_db
ENV POSTGRES_USER=judge
ENV POSTGRES_PASSWORD=judgepass
ENV PGDATA=/var/lib/postgresql/data/pgdata

# Create workspace
RUN mkdir -p /workspace /submission \
	&& chown -R postgres:postgres /workspace /submission

WORKDIR /workspace

# PostgreSQL will start automatically
CMD ["postgres"]
