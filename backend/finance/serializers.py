from decimal import Decimal

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from .models import (
    Budget,
    Category,
    Expense,
    Income,
    SavingsContribution,
    SavingsGoal,
    User,
)


DEFAULT_CATEGORIES = {
    Category.Kind.INCOME: ["Salary", "Business", "Freelance", "Investment", "Other"],
    Category.Kind.EXPENSE: [
        "Food",
        "Transport",
        "Rent",
        "Shopping",
        "Entertainment",
        "Utilities",
        "Health",
        "Other",
    ],
}


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ("id", "email", "password", "first_name", "last_name")

    def create(self, validated_data):
        with transaction.atomic():
            user = User.objects.create_user(**validated_data)
            Category.objects.bulk_create(
                [
                    Category(user=user, name=name, kind=kind)
                    for kind, names in DEFAULT_CATEGORIES.items()
                    for name in names
                ]
            )
        return user


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name")
        read_only_fields = ("id", "email")


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "kind", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Category name cannot be empty.")
        return value

    def validate(self, attrs):
        if self.instance and attrs.get("kind", self.instance.kind) != self.instance.kind:
            if (
                self.instance.income_set.exists()
                or self.instance.expense_set.exists()
                or self.instance.budgets.exists()
            ):
                raise serializers.ValidationError(
                    {"kind": "A category with existing records cannot change type."}
                )
        return attrs


class RecordSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.none())

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(
                user=request.user, kind=self.category_kind
            )

    class Meta:
        fields = ("id", "category", "category_name", "amount", "date", "note", "created_at")
        read_only_fields = ("id", "created_at", "category_name")


class IncomeSerializer(RecordSerializer):
    category_kind = Category.Kind.INCOME

    class Meta(RecordSerializer.Meta):
        model = Income


class ExpenseSerializer(RecordSerializer):
    category_kind = Category.Kind.EXPENSE

    class Meta(RecordSerializer.Meta):
        model = Expense


class BudgetSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.none())
    category_name = serializers.CharField(source="category.name", read_only=True)
    spent = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Budget
        fields = ("id", "category", "category_name", "month", "amount", "spent", "progress")
        read_only_fields = ("id", "spent", "progress", "category_name")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(
                user=request.user, kind=Category.Kind.EXPENSE
            )

    def validate_month(self, value):
        if value.day != 1:
            raise serializers.ValidationError("Choose the first day of the budget month.")
        return value

    def get_spent(self, obj):
        total = Expense.objects.filter(
            user=obj.user,
            category=obj.category,
            date__year=obj.month.year,
            date__month=obj.month.month,
        ).aggregate(total=Sum("amount"))["total"]
        return total or Decimal("0.00")

    def get_progress(self, obj):
        if not obj.amount:
            return 0
        return round(float(self.get_spent(obj) / obj.amount * 100), 1)


class SavingsGoalSerializer(serializers.ModelSerializer):
    saved_amount = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = SavingsGoal
        fields = ("id", "title", "target_amount", "target_date", "saved_amount", "progress", "created_at")
        read_only_fields = ("id", "saved_amount", "progress", "created_at")

    def get_saved_amount(self, obj):
        return obj.contributions.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    def get_progress(self, obj):
        if not obj.target_amount:
            return 0
        return round(float(self.get_saved_amount(obj) / obj.target_amount * 100), 1)

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Goal name cannot be empty.")
        return value


class SavingsContributionSerializer(serializers.ModelSerializer):
    goal = serializers.PrimaryKeyRelatedField(queryset=SavingsGoal.objects.none())
    goal_title = serializers.CharField(source="goal.title", read_only=True)

    class Meta:
        model = SavingsContribution
        fields = ("id", "goal", "goal_title", "amount", "date", "note", "created_at")
        read_only_fields = ("id", "goal_title", "created_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["goal"].queryset = SavingsGoal.objects.filter(user=request.user)
