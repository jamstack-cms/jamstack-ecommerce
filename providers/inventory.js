import uuid from "uuid/v4"

let inventory = [
  {
    categories: ["new arrivals", "DJI"],
    name: "PHANTOM 4 RTK",
    price: "1000",
    image: "../images/products/phantom-4-rtk.png",
    description:
      "Visionary Intelligence. Elevated Accuracy. Upgrade your next mapping mission with the Phantom 4 RTK – the most compact and accurate low altitude mapping solution.",
    brand: "DJI",
    currentInventory: 4,
  },
  {
    categories: ["new arrivals", "DJI"],
    name: "Matrice 200 Series V2",
    price: "1000",
    image: "../images/products/matrice-200-series-v2.png",
    description:
      "Built to Endure. Engineered to Adapt. The ultimate platform for aerial productivity combines a rugged design and simple configurability to work as a solution for a variety of industrial applications. Improvements to the M200 Series V2 enhance intelligent control systems, flight performance, and add flight safety and data security features.",
    brand: "DJI",
    currentInventory: 2,
  },
  {
    categories: ["new arrivals", "YUNEEC"],
    name: "H520",
    price: "800",
    image: "../images/products/h520.png",
    description:
      "Commercial aerial solution. The H520 system utilizes Yuneec’s proven six-rotor platform and incorporates enterprise-grade cameras and mission planning software for high-end commercial use. The sUAS is the perfect solution for long flight times and a proven and robust technology in an all-in-one package. The H520 is built for inspection, law enforcement, security, construction, surveying, and mapping applications in addition to offering cinematic imaging payload systems.",
    brand: "YUNEEC",
    currentInventory: 8,
  },
  {
    categories: ["new arrivals", "senseFly"],
    name: "eBee X",
    price: "900",
    image: "../images/products/ebee-x.png",
    description:
      "Map Without Limits. The eBee X is the fixed-wing drone for all your mapping needs. Designed to boost the quality, efficiency and safety of your data collection, it has a camera to suit every job, the accuracy and coverage to meet every project’s requirements, and can work virtually every type of site.",
    brand: "senseFly",
    currentInventory: 10,
  },
  {
    categories: ["new arrivals", "senseFly"],
    name: "eBee Plus",
    price: "1200",
    image: "../images/products/ebee-plus.png",
    description:
      "Why choose the eBee Plus? The eBee Plus survey drone is a large-coverage photogrammetric mapping system featuring RTK/PPK upgradeability, for survey-grade accuracy on demand.",
    brand: "senseFly",
    currentInventory: 7,
  },
  {
    categories: ["new arrivals", "Hélicéo"],
    name: "Fox4",
    price: "500",
    image: "../images/products/fox4.png",
    description:
      "The smart drone for mapping and inspection. The Fox4 is a multirotor drone with 4 carbon blades. Its light structure and engine allow for extreme maneuverability with manual piloting. Designed for automatic photogrammetry missions up to 1.5 km², Fox4 may also carry out missions for inspection of infrastructure, structures, network lines or industrial sites, in automatic or manual mode.",
    brand: "Hélicéo",
    currentInventory: 13,
  },
]

inventory.map(i => {
  i.id = uuid()
  return i
})

export default inventory
