from app.main import app

def print_routes(routes, prefix=""):
    for route in routes:
        if hasattr(route, "path"):
            print(f"{prefix}{route.path}: {route.methods}")
        elif hasattr(route, "routes"):
            new_prefix = prefix + getattr(route, "prefix", "")
            print_routes(route.routes, new_prefix)
        elif hasattr(route, "app"): # FastAPI Mount
            print(f"{prefix}{route.path}: Mount")
        elif hasattr(route, "include_context"): # IncludedRouter
            # Attempt to extract prefix from include_context
            p = getattr(route.include_context, "prefix", "")
            print(f"{prefix}IncludedRouter prefix: {p}")
        else:
            print(f"{prefix}Unknown route type: {type(route)}")

print_routes(app.routes)
