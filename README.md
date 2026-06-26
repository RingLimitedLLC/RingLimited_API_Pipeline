# Ring API Pipeline

Internal API connection management app for Ring. The current migration target is Azure App Service with Microsoft Entra Easy Auth, Cosmos DB Mongo API metadata storage, and 1Password Connect for client secrets.

## Local Development

**Prerequisites:**

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_INTERNAL_API_BASE_URL=http://localhost:3001
```

Run the frontend and backend together:

```bash
npm run dev:all
```

## Deploy to Azure App Service

The production hostname is:

```text
https://pipeline.ring.digital/
```

It points to the Azure App Service:

```text
https://ring-pipeline-application-f9g7cteff2cyb2c3.westus2-01.azurewebsites.net/
```

The App Service can run this repo as a single Node app:

1. Push `main` to the GitHub repo connected to Azure Deployment Center.
2. Azure should run the root install/build flow and then start the app with `npm start`.
3. The root `npm start` launches the Express backend from `server/`, and Express serves the built Vite UI from `dist/`.
4. Test the production hostname:

```
https://pipeline.ring.digital/
```

To test Microsoft Entra Easy Auth directly:

```
https://pipeline.ring.digital/.auth/login/aad?post_login_redirect_uri=/
```
