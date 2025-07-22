default:
    echo "Available recipes: build, test, clean, generate-schema"

generate-schema:
    python3 scripts/generate_ts_schema.py

build:
    python3 scripts/generate_ts_schema.py && sudo rm -rf node_modules && .vscode/build.sh

test:
    scp "out/Lossless Scaling.zip" deck@192.168.0.6:~/Desktop

clean:
    rm -rf node_modules dist