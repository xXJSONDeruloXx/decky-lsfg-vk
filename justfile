default:
    echo "Available recipes: build, test, clean"

build:
    sudo rm -rf node_modules && .vscode/build.sh

test:
    scp "/Users/kurt/Developer/decky-lossless-scaling-vk/out/Lossless Scaling.zip" deck@192.168.0.6:~/Desktop

clean:
    rm -rf node_modules dist