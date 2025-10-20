FROM postgres:14-alpine

# Update repositories and install required tools
RUN apk update && apk add --no-cache \
    bash \
    postgresql-client \
    curl \
    jq

# Set timezone
ENV TZ=UTC

# Database connection info
ENV PGHOST=database
ENV PGPORT=5432
ENV PGDATABASE=hackathon_db
ENV PGUSER=judge
ENV PGPASSWORD=judgepass

# Create workspace
RUN mkdir -p /workspace /submission /shared

WORKDIR /workspace

CMD ["bash"]
