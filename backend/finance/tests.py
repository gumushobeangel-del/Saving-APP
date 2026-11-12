from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.test import APIClient

from .models import Budget, Category, Expense, Income, SavingsContribution, SavingsGoal


User = get_user_model()


class FinanceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(email="alice@example.com", password="StrongPass123!")
        self.bob = User.objects.create_user(email="bob@example.com", password="StrongPass123!")
        self.food = Category.objects.create(user=self.alice, name="Food", kind="expense")
        self.salary = Category.objects.create(user=self.alice, name="Salary", kind="income")
        self.bob_food = Category.objects.create(user=self.bob, name="Food", kind="expense")
        self.client.force_authenticate(self.alice)

    def test_api_root_reports_service_status(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"service": "SaveWise API", "status": "running", "api_base": "/api/"},
        )

    def test_registration_creates_user_and_default_categories(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "new@example.com",
                "password": "NewPassword567!",
                "first_name": "New",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        created = User.objects.get(email="new@example.com")
        self.assertTrue(created.check_password("NewPassword567!"))
        self.assertTrue(Category.objects.filter(user=created, name="Food").exists())

    def test_records_and_categories_are_private(self):
        Income.objects.create(
            user=self.alice, category=self.salary, amount="1000000.00", date=date.today()
        )
        Expense.objects.create(
            user=self.bob, category=self.bob_food, amount="900000.00", date=date.today()
        )
        response = self.client.get("/api/income/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

        response = self.client.post(
            "/api/expenses/",
            {"category": self.bob_food.id, "amount": "5000.00", "date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Expense.objects.filter(user=self.alice).exists())
        self.assertEqual(len(self.client.get("/api/categories/").data), 2)

    def test_dashboard_totals_update_from_income_expense_and_savings(self):
        Income.objects.create(
            user=self.alice, category=self.salary, amount="1000000.00", date=date.today()
        )
        Expense.objects.create(
            user=self.alice, category=self.food, amount="150000.00", date=date.today()
        )
        goal = SavingsGoal.objects.create(
            user=self.alice, title="Emergency fund", target_amount="300000.00"
        )
        SavingsContribution.objects.create(
            user=self.alice, goal=goal, amount="50000.00", date=date.today()
        )

        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["available_balance"], Decimal("800000.00"))
        self.assertEqual(response.data["income_this_month"], Decimal("1000000.00"))
        self.assertEqual(response.data["expenses_this_month"], Decimal("150000.00"))
        self.assertEqual(response.data["total_savings"], Decimal("50000.00"))

    def test_expense_crud_refreshes_dashboard_totals(self):
        create = self.client.post(
            "/api/expenses/",
            {"category": self.food.id, "amount": "25000.00", "date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        expense_id = create.data["id"]
        self.assertEqual(self.client.get("/api/dashboard/").data["expenses_this_month"], Decimal("25000.00"))

        update = self.client.patch(
            f"/api/expenses/{expense_id}/", {"amount": "30000.00"}, format="json"
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(self.client.get("/api/dashboard/").data["expenses_this_month"], Decimal("30000.00"))

        delete = self.client.delete(f"/api/expenses/{expense_id}/")
        self.assertEqual(delete.status_code, 204)
        self.assertEqual(self.client.get("/api/dashboard/").data["expenses_this_month"], Decimal("0.00"))

    def test_goals_and_contributions_are_private_to_their_owner(self):
        bob_goal = SavingsGoal.objects.create(
            user=self.bob, title="Private goal", target_amount="100000.00"
        )
        response = self.client.get("/api/goals/")
        self.assertEqual(response.data, [])
        self.assertEqual(self.client.get(f"/api/goals/{bob_goal.id}/").status_code, 404)

        response = self.client.post(
            "/api/contributions/",
            {"goal": bob_goal.id, "amount": "5000.00", "date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(SavingsContribution.objects.filter(user=self.alice).exists())

    def test_saving_contribution_updates_goal_and_dashboard(self):
        goal = SavingsGoal.objects.create(
            user=self.alice, title="New laptop", target_amount="200000.00"
        )
        response = self.client.post(
            "/api/contributions/",
            {"goal": goal.id, "amount": "50000.00", "date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        goal_data = self.client.get("/api/goals/").data[0]
        self.assertEqual(goal_data["saved_amount"], Decimal("50000.00"))
        self.assertEqual(goal_data["progress"], 25)
        self.assertEqual(
            self.client.get("/api/dashboard/").data["total_savings"],
            Decimal("50000.00"),
        )

    def test_logout_revokes_the_refresh_token(self):
        refresh = str(RefreshToken.for_user(self.alice))
        logout = self.client.post("/api/auth/logout/", {"refresh": refresh}, format="json")
        self.assertEqual(logout.status_code, 200)

        response = self.client.post(
            "/api/auth/token/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_budget_and_goal_progress_are_calculated(self):
        Budget.objects.create(
            user=self.alice,
            category=self.food,
            month=date.today().replace(day=1),
            amount="200000.00",
        )
        Expense.objects.create(
            user=self.alice, category=self.food, amount="100000.00", date=date.today()
        )
        response = self.client.get("/api/budgets/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["spent"], Decimal("100000.00"))
        self.assertEqual(response.data[0]["progress"], 50)

        goal = SavingsGoal.objects.create(
            user=self.alice, title="Trip", target_amount="400000.00"
        )
        SavingsContribution.objects.create(
            user=self.alice, goal=goal, amount="100000.00", date=date.today()
        )
        goal_response = self.client.get("/api/goals/")
        self.assertEqual(goal_response.data[0]["progress"], 25)

    def test_report_period_validation_and_empty_states(self):
        response = self.client.get("/api/reports/?period=yearly")
        self.assertEqual(response.status_code, 400)
        response = self.client.get("/api/reports/?period=weekly")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 7)
        self.assertTrue(all(item["income"] == Decimal("0.00") for item in response.data["results"]))
