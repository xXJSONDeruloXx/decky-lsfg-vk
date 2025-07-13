import { staticClasses } from "@decky/ui";
import { definePlugin } from "@decky/api";
import { GiPlasticDuck } from "react-icons/gi";
import { Content } from "./components";

export default definePlugin(() => {
  console.log("Lossless Scaling plugin initializing");

  return {
    // The name shown in various decky menus
    name: "Lossless Scaling",
    // The element displayed at the top of your plugin's menu
    titleView: <div className={staticClasses.Title}>Lossless Scaling</div>,
    // The content of your plugin's menu
    content: <Content />,
    // The icon displayed in the plugin list
    icon: <GiPlasticDuck />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("Lossless Scaling unloading");
    }
  };
});
