def rupees_to_paise(value: str) -> int:
    value = value.strip()
    if not value or value.startswith("-"):
        raise ValueError("Invalid positive amount")
    whole, dot, frac = value.partition(".")
    if not whole.isdigit() or (dot and (not frac.isdigit() or len(frac) > 2)):
        raise ValueError("Invalid INR amount")
    frac = (frac + "00")[:2] if dot else "00"
    return int(whole) * 100 + int(frac)

def format_paise(paise: int) -> str:
    if not isinstance(paise, int):
        raise TypeError("Money must be integer paise")
    return f"₹{paise // 100}.{paise % 100:02d}"
