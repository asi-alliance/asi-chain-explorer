# ==============================
# Stage 1: Build Rust CLI
# ==============================
FROM rust:slim AS rust-builder

# Install dependencies required to build Rust CLI and OpenSSL
RUN apt-get update && apt-get install -y \
    git \
    curl \
    make \
    build-essential \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Clone the Rust CLI repository and build the binary
ARG RUST_CLIENT_VERSION=v0.1
WORKDIR /rust-client
RUN git clone --branch ${RUST_CLIENT_VERSION} --depth 1 https://github.com/singnet/rust-client.git .
RUN cargo build --release

# ==============================
# Stage 2: Build Python dependencies
# ==============================
FROM python:3.11-slim AS python-builder

# Install build dependencies for Python packages
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*


# Set working directory and install Python dependencies
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt
# --no-cache-dir avoids caching wheels to reduce image size
# --user installs packages to /root/.local to avoid system-wide installation

# ==============================
# Stage 3: Runtime image
# ==============================
FROM python:3.11-slim

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m -u 1000 indexer

WORKDIR /app

# Copy Python dependencies from python-builder
COPY --from=python-builder /root/.local /home/indexer/.local

# Copy Rust CLI binary from rust-builder
COPY --from=rust-builder /rust-client/target/release/node_cli /usr/local/bin/node_cli
RUN chmod +x /usr/local/bin/node_cli   # make binary executable

# Copy application code
COPY . .

# Set ownership of app and Python packages
RUN chown -R indexer:indexer /app /home/indexer/.local

# Switch to non-root user
USER indexer

# Set environment variables
ENV PYTHONPATH=/app
ENV PATH="/home/indexer/.local/bin:${PATH}"
ENV RUST_CLI_PATH=/usr/local/bin/node_cli
ENV PYTHONUNBUFFERED=1
# ensures logs are not buffered

# Expose monitoring port
EXPOSE 9090

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9090/health || exit 1

# Run the Python indexer module
CMD ["python", "-m", "src.main"]
