FROM golang:1.24-bookworm AS builder
WORKDIR /usr/src/app/
ARG GOPROXY=https://proxy.golang.org,direct
COPY ./src/order-tracker/go.mod ./src/order-tracker/go.sum ./
RUN go mod download
COPY ./src/order-tracker/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags "-s -w" -o order-tracker .
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /usr/src/app/
COPY --from=builder /usr/src/app/order-tracker ./
ENTRYPOINT [ "./order-tracker" ]
