default:
    echo "Available recipes: build, test, clean"

build:
    rm -rf node_modules && .vscode/build.sh

test:
    scp "/Users/kurt/Developer/decky-plugin-template/out/lsfg-vk Installer.zip" deck@192.168.0.6:~/Desktop

clean:
    rm -rf node_modules dist