from app.utils.money import format_paise, rupees_to_paise


def test_money():
    assert rupees_to_paise("20") == 2000
    assert rupees_to_paise("20.50") == 2050
    assert format_paise(2050) == "₹20.50"
