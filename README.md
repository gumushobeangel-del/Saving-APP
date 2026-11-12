# SaveWise

SaveWise is a personal finance application for tracking income, expenses, monthly budgets, and savings goals. UGX is the default currency.

## Architecture

- **Frontend:** React, Vite, plain CSS, and Chart.js
- **API:** Django REST Framework with JWT authentication
- **Database:** MySQL 8
- **Privacy:** Every finance API endpoint filters records by the authenticated user. Categories are private to each account.

The React app talks to the Django API at `/api/`. In local development, Vite proxies API requests to Django. Docker Compose starts the database, API, and frontend together.

## How the pieces fit together

Think of React as the part a person sees and Django as the part that checks, calculates, and saves things:

1. A page or form in `frontend/src/App.jsx` sends a request through `frontend/src/api.js`.
2. Django checks the sign-in token, validates the submitted values, and only looks up records belonging to that signed-in user.
3. Django reads or writes MySQL and returns JSON. React uses that response to refresh the dashboard and show a success or error message.

The database has a custom email-based `User`. Each `Category`, `Income`, and `Expense` belongs to one user. A `Budget` belongs to a user, an expense category, and the first day of a month. A `SavingsGoal` belongs to a user, and each `SavingsContribution` belongs to both that user and one of their goals. Money is stored as decimal values (not floating-point numbers) to avoid rounding errors.

The main code is grouped by job: `backend/config/` contains Django settings and routes; `backend/finance/models.py` describes database tables; `serializers.py` validates API data; `views.py` scopes requests to the signed-in user and calculates totals; and `tests.py` checks calculations and privacy. On the frontend, `src/components/` contains sign-in UI, `App.jsx` connects screens to API data, and `styles.css` handles the responsive layout.

## Run with Docker

1. Copy `.env.example` to `.env` and set a long, unique `DJANGO_SECRET_KEY` and MySQL password.
2. From the project root, run:

   ```sh
   docker compose up --build
   ```

3. Open `http://localhost:5173` and register an account. The API is available at `http://localhost:8000/api/`.

The API container applies database migrations on startup. To create an admin account:

```sh
docker compose exec backend python manage.py createsuperuser
```

Before deploying for real users, set `DJANGO_DEBUG=0`, use unique long values for both Django and MySQL secrets, replace `DJANGO_ALLOWED_HOSTS` with your domain, and put the application behind HTTPS. Do not reuse the example secrets from `.env.example`.

## Run locally

With `USE_SQLITE=1` in `.env`, the API uses the local SQLite database and does not need MySQL. Start the API and frontend in separate terminals, and leave both running:

```sh
cd backend
python manage.py migrate
python manage.py runserver
```

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Vite proxies `/api/` requests to Django at `http://localhost:8000`; registration and sign-in will fail if the API terminal is stopped. If you set `USE_SQLITE=0`, start MySQL 8, create the `savewise` database, and configure the MySQL variables in `.env` using `.env.example` as a guide. Set `VITE_API_URL` only when the API is hosted at a different origin.

## Main API routes

All routes below are prefixed with `/api/`. Register at `auth/register/`, obtain and refresh JWTs at `auth/token/` and `auth/token/refresh/`, and revoke the refresh token at `auth/logout/`. Use `dashboard/` and `reports/` for summaries. Authenticated CRUD endpoints are `categories/`, `income/`, `expenses/`, `budgets/`, `goals/`, and `contributions/`. Finance endpoints require a valid access token.

Amounts are positive decimal values stored to two decimal places. Income and expense categories are account-specific. A budget belongs to one expense category and calendar month. Savings goal progress is calculated from its contributions; dashboard available balance is lifetime income less lifetime expenses and savings contributions.

## Tests

The automated API tests use an in-memory SQLite database, so MySQL is not required for this check. From `backend/`, run:

```sh
python manage.py test --settings=config.test_settings
```
