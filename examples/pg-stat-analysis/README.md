<p align="center">
  <img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# @inferable/pg-stat-analysis

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

`@inferable/pg-stat-analysis` is an analytical agent designed to evaluate and improve the performance of your PostgreSQL database through recommendations based on access patterns. The agent provides suggestions such as creating indexes or other optimization strategies to enhance query performance. It makes use of the `pg_stat_statements` extension to provide data-driven recommendations.

## Prerequisites

- **Node.js** - Ensure you have Node.js installed.
- **PostgreSQL** - A running PostgreSQL instance with the `pg_stat_statements` [extension enabled](https://www.postgresql.org/docs/current/pgstatstatements.html).
- **Data Connector** - This projects assumes you are runnign the [Inferable Data Connector](https://github.com/inferablehq/inferable/tree/main/data-connector) which provides the connection to your database.

## Installation

1. **Install Dependencies:**

   ```bash
   npm install
   ```

2. **Environment Setup:**

   Create a `.env` file in the project root with the following variable:

   ```
   INFERABLE_API_SECRET=your_inferable_api_secret
   ```

   Replace `your_inferable_api_secret` with your Cluster's [API secret](https://docs.inferable.ai/pages/auth#cluster-api-keys).

## Usage

Once the environment is set up, you can run the project in development mode using the following command:

```bash
npm run dev
```

This will initiate the agent, which will analyze your database and provide performance-enhancing recommendations stored in `history.json`.
Multiple runs will append to the existing data in `history.json`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you have any questions or issues, please open an issue on this repository.
