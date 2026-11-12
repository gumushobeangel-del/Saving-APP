from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BudgetViewSet,
    CategoryViewSet,
    ExpenseViewSet,
    IncomeViewSet,
    ProfileView,
    SavingsContributionViewSet,
    SavingsGoalViewSet,
    dashboard,
    reports,
)


router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("income", IncomeViewSet, basename="income")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("budgets", BudgetViewSet, basename="budget")
router.register("goals", SavingsGoalViewSet, basename="goal")
router.register("contributions", SavingsContributionViewSet, basename="contribution")

urlpatterns = [
    path("profile/", ProfileView.as_view(), name="profile"),
    path("dashboard/", dashboard, name="dashboard"),
    path("reports/", reports, name="reports"),
    path("", include(router.urls)),
]
