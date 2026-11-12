from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import generics, serializers, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import (
    Budget,
    Category,
    Expense,
    Income,
    SavingsContribution,
    SavingsGoal,
)
from .serializers import (
    BudgetSerializer,
    CategorySerializer,
    ExpenseSerializer,
    IncomeSerializer,
    ProfileSerializer,
    RegisterSerializer,
    SavingsContributionSerializer,
    SavingsGoalSerializer,
)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer

    def get_object(self):
        return self.request.user


class OwnedViewSet(viewsets.ModelViewSet):
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class CategoryViewSet(OwnedViewSet):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def perform_destroy(self, instance):
        if (
            instance.income_set.exists()
            or instance.expense_set.exists()
            or instance.budgets.exists()
        ):
            raise serializers.ValidationError(
                {"detail": "This category is used by existing records and cannot be deleted."}
            )
        instance.delete()


class IncomeViewSet(OwnedViewSet):
    serializer_class = IncomeSerializer

    def get_queryset(self):
        return Income.objects.filter(user=self.request.user).select_related("category")


class ExpenseViewSet(OwnedViewSet):
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        return Expense.objects.filter(user=self.request.user).select_related("category")


class BudgetViewSet(OwnedViewSet):
    serializer_class = BudgetSerializer

    def get_queryset(self):
        return Budget.objects.filter(user=self.request.user).select_related("category")


class SavingsGoalViewSet(OwnedViewSet):
    serializer_class = SavingsGoalSerializer

    def get_queryset(self):
        return SavingsGoal.objects.filter(user=self.request.user)


class SavingsContributionViewSet(OwnedViewSet):
    serializer_class = SavingsContributionSerializer

    def get_queryset(self):
        return SavingsContribution.objects.filter(user=self.request.user).select_related("goal")


def total_for(queryset):
    return queryset.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")


def month_bounds(year, month):
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    return start, end


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    today = timezone.localdate()
    month_start, month_end = month_bounds(today.year, today.month)
    incomes = Income.objects.filter(user=request.user)
    expenses = Expense.objects.filter(user=request.user)
    contributions = SavingsContribution.objects.filter(user=request.user)

    month_income = total_for(incomes.filter(date__range=(month_start, month_end)))
    month_expenses = total_for(expenses.filter(date__range=(month_start, month_end)))
    all_income = total_for(incomes)
    all_expenses = total_for(expenses)
    savings = total_for(contributions)

    recent = [
        {
            "id": f"income-{item.id}",
            "type": "income",
            "label": item.category.name,
            "note": item.note,
            "amount": item.amount,
            "date": item.date,
            "created_at": item.created_at,
        }
        for item in incomes.select_related("category").order_by("-date", "-created_at")[:8]
    ] + [
        {
            "id": f"expense-{item.id}",
            "type": "expense",
            "label": item.category.name,
            "note": item.note,
            "amount": item.amount,
            "date": item.date,
            "created_at": item.created_at,
        }
        for item in expenses.select_related("category").order_by("-date", "-created_at")[:8]
    ]
    recent.sort(key=lambda item: (item["date"], item["created_at"]), reverse=True)

    return Response(
        {
            "currency": "UGX",
            "available_balance": all_income - all_expenses - savings,
            "income_this_month": month_income,
            "expenses_this_month": month_expenses,
            "total_savings": savings,
            "month": today.strftime("%B %Y"),
            "recent_transactions": recent[:8],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reports(request):
    period = request.query_params.get("period", "monthly")
    today = timezone.localdate()

    if period == "weekly":
        start = today - timedelta(days=6)
        labels = [start + timedelta(days=index) for index in range(7)]
        buckets = [
            {"label": day.strftime("%a"), "date": day.isoformat(), "income": Decimal("0.00"), "expenses": Decimal("0.00")}
            for day in labels
        ]
        income_rows = Income.objects.filter(user=request.user, date__range=(start, today))
        expense_rows = Expense.objects.filter(user=request.user, date__range=(start, today))
        index_by_date = {day: index for index, day in enumerate(labels)}
        for row in income_rows.values("date").annotate(total=Sum("amount")):
            buckets[index_by_date[row["date"]]]["income"] = row["total"]
        for row in expense_rows.values("date").annotate(total=Sum("amount")):
            buckets[index_by_date[row["date"]]]["expenses"] = row["total"]
    elif period == "monthly":
        buckets = []
        for months_back in range(5, -1, -1):
            year, month = today.year, today.month - months_back
            while month <= 0:
                month += 12
                year -= 1
            start, end = month_bounds(year, month)
            buckets.append(
                {
                    "label": start.strftime("%b"),
                    "date": start.isoformat(),
                    "income": total_for(
                        Income.objects.filter(user=request.user, date__range=(start, end))
                    ),
                    "expenses": total_for(
                        Expense.objects.filter(user=request.user, date__range=(start, end))
                    ),
                }
            )
    else:
        return Response(
            {"period": ["Choose either 'weekly' or 'monthly'."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({"period": period, "currency": "UGX", "results": buckets})
