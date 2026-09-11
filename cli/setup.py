from setuptools import setup, find_packages

setup(
    name="signful-cli",
    version="1.0.0",
    py_modules=["signful"],
    package_dir={"": "."},
    install_requires=[
        "typer>=0.9.0",
        "pyyaml>=6.0",
        "requests>=2.31.0",
        "rich>=13.0.0",
        "reportlab>=4.0.0",
        "pillow>=10.0.0"
    ],
    entry_points={
        "console_scripts": [
            "signful=signful:app",
        ],
    },
)
