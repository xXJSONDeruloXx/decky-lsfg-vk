default:
    echo "Available recipes: build, deploy, test, clean"

build:
    pnpm build

deploy:
    ./scripts/deploy-to-deck.sh

test:
    scp "out/Decky LSFG-VK.zip" deck@192.168.0.6:~/Desktop

watch:
    ssh deck@192.168.0.6 "journalctl -f"

cef:
    tail -f ~/.local/share/Steam/logs/cef_log.txt 

clean:
    rm -rf node_modules dist
    sudo rm -rf /tmp/decky
