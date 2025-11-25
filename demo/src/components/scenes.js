import alma from "../images/alma.jpg";
import milan from "../images/milan.jpg";

export const scenes = {
    roomA: {
        image: alma,
        hotspots: [
            {
                id: "toRoomB",
                pitch: 10,
                yaw: 120,
                target: "roomB",
                icon: "/icons/arrow.png",
            }
        ]
    },

    roomB: {
        image: milan,
        hotspots: [
            {
                id: "backToRoomA",
                pitch: 5,
                yaw: 220,
                target: "roomA",
                icon: "/icons/back.png",
            }
        ]
    }
};
