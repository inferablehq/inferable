# Inferable Load Testing

This directory contains load tests for the Inferable Control Plane using k6.

## Prerequisites

- Node.js
- k6 ([Installation Guide](https://k6.io/docs/get-started/installation/))

## Running the Tests

1. First, start the machine service:
```bash
npm run machine:start
```

2. In a new terminal, run the k6 tests:
```bash
npm run test:start
```
