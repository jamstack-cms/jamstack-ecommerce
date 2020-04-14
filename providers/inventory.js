import uuid from "uuid/v4"

let inventory = [
  {
    categories: ["salt lamp"],
    name: "Pyramid Lamp",
    price: "490",
    image: "../images/products/pyramidlamp.png",
    description:
      "This lamp is cut in a unique pyramid shape ans available in medium and large. Ionic Air Purifier with on/off cord and a solid wooden base",
    brand: "Earth Supply",
    currentInventory: 4,
  },
  {
    categories: ["new arrivals", "salt lamp"],
    name: "Natural Lamp",
    price: "360",
    image: "../images/products/naturallamp.png",
    description:
      "Salt Lamps are fantastic for improving the air quality in your home and aid in relieving symptoms of breathing difficulties and numerous health concerns. They look fantastic in any home or office. All electric Himalayan Salt Lamps come with a standard cord & bulb. Available in sizes ranging from 2 - 60kg",
    brand: "Earth Supply",
    currentInventory: 2,
  },
  {
    categories: ["salt lamp"],
    name: "Detox Lamp",
    price: "480",
    image: "../images/products/detoxlamp.png",
    description:
      "Gently exfoliate the skin as it binds with the salt through moisture on your hands and feet.",
    brand: "Earth Supply",
    currentInventory: 8,
  },
  {
    categories: ["new arrivals", "salt lamp"],
    name: "Massage Lamp",
    price: "550",
    image: "../images/products/massagelamp.png",
    description:
      "Handmade massage stones will loosen tensed muscles and soothe aches and pain when rubbed/rolled over sore muscles",
    brand: "Earth Supply",
    currentInventory: 10,
  },
  {
    categories: ["salt lamp"],
    name: "Heart Lamp",
    price: "470",
    image: "../images/products/heartlamp.png",
    description:
      "This lamp is handcrafted and an excellent gift to a loved one.",
    brand: "Earth Supply",
    currentInventory: 7,
  },
  {
    categories: ["on sale", "salt lamp"],
    name: "Aroma Lamp",
    price: "420",
    image: "../images/products/aromalamp.png",
    description:
      "These lamps acts as air purifiers by emitting negative ions into the air and is stress reliever",
    brand: "Earth Supply",
    currentInventory: 13,
  },
  {
    categories: ["on sale", "salt lamp"],
    name: "Fire Bowl Lamp M",
    price: "400",
    image: "../images/products/firebowl.png",
    description:
      "These handmade stones and warming bowl will loosen tensed muscles also soothe aches and pains when rubbed over sore muscles",
    brand: "Earth Supply",
    currentInventory: 9,
  },
  {
    categories: ["salt lamp"],
    name: "Fire Bowl Lamp L",
    price: "450",
    image: "../images/products/firebowl.png",
    description:
      "These handmade stones and warming bowl will loosen tensed muscles also soothe aches and pains when rubbed over sore muscles",
    brand: "Earth Supply",
    currentInventory: 9,
  },
  {
    categories: ["kitchen", "on sale"],
    name: "Edible Salt",
    price: "50",
    image: "../images/products/ediblesalt.png",
    description: "Jimalayan Pink Salt, fine or coarse. Available in bulk sizes",
    brand: "Earth Supply",
    currentInventory: 24,
  },
  {
    categories: ["kitchen", "on sale"],
    name: "Coarse Salt",
    price: "50",
    image: "../images/products/ediblesalt.png",
    description:
      "Jimalayan Pink Salt, fine or coarse. Available in bulk sizes.",
    brand: "Earth Supply",
    currentInventory: 24,
  },

  {
    categories: ["new arrivals", "kitchen"],
    name: "Shot Glasses",
    price: "350",
    image: "../images/products/shotglasses.png",
    description:
      "Surprise your guests with this unique party trick! Hand carved salt glasses. Excellent with shooters, tequila and infused drinks",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["new arrivals", "kitchen"],
    name: "Mortar and Pistol M",
    price: "260",
    image: "../images/products/mortarpestle.png",
    description:
      "Use it as a Pestle and Mortar or as a chilled serving bowl for salads, ice cream or cold dishes",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["kitchen"],
    name: "Mortar and Pistol L",
    price: "400",
    image: "../images/products/mortarpestle.png",
    description:
      "Use it as a Pestle and Mortar or as a chilled serving bowl for salads, ice cream or cold dishes",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["salt blocks"],
    name: "Blocks 8x8x2",
    price: "280",
    image: "../images/products/saltblocks.png",
    description:
      "Himalayan Salt Blocks offer a healthy and unique cooking experience for both meat and vegetables. Himalayan Salt Blocks and Trays come in a range of sizes and are easy to cook on and maintained",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["salt blocks"],
    name: "Blocks 10x8x1.5",
    price: "350",
    image: "../images/products/saltblocks.png",
    description:
      "Himalayan Salt Blocks offer a healthy and unique cooking experience for both meat and vegetables. Himalayan Salt Blocks and Trays come in a range of sizes and are easy to cook on and maintained",
    brand: "Earth Supply",
    currentInventory: 43,
  },

  {
    categories: ["salt blocks"],
    name: "Blocks 12x8x1.5",
    price: "400",
    image: "../images/products/saltblocks.png",
    description:
      "Himalayan Salt Blocks offer a healthy and unique cooking experience for both meat and vegetables. Himalayan Salt Blocks and Trays come in a range of sizes and are easy to cook on and maintained",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["salt blocks"],
    name: "Blocks 12x8x2",
    price: "450",
    image: "../images/products/saltblocks.png",
    description:
      "Himalayan Salt Blocks offer a healthy and unique cooking experience for both meat and vegetables. Himalayan Salt Blocks and Trays come in a range of sizes and are easy to cook on and maintained",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["salt blocks"],
    name: "Blocks 16x8x2",
    price: "600",
    image: "../images/products/saltblocks.png",
    description:
      "Himalayan Salt Blocks offer a healthy and unique cooking experience for both meat and vegetables. Himalayan Salt Blocks and Trays come in a range of sizes and are easy to cook on and maintained",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["trays"],
    name: "Trays 10x8x1.5",
    price: "270",
    image: "../images/products/saltblocks.png",
    description:
      "Himalayan Salt Blocks offer a healthy and unique cooking experience for both meat and vegetables. Himalayan Salt Blocks and Trays come in a range of sizes and are easy to cook on and maintained",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["trays"],
    name: "Trays M",
    price: "300",
    image: "../images/products/saltblocks.png",
    description:
      "Himalayan Salt Blocks offer a healthy and unique cooking experience for both meat and vegetables. Himalayan Salt Blocks and Trays come in a range of sizes and are easy to cook on and maintained",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["trays"],
    name: "Trays L",
    price: "350",
    image: "../images/products/saltblocks.png",
    description:
      "Himalayan Salt Blocks offer a healthy and unique cooking experience for both meat and vegetables. Himalayan Salt Blocks and Trays come in a range of sizes and are easy to cook on and maintained",
    brand: "Earth Supply",
    currentInventory: 43,
  },
  {
    categories: ["on sale", "wellness"],
    name: "Massage Roller",
    price: "120",
    image: "../images/products/split.png",
    description: "Energising for presurpoints in relieving stress and pain.",
    brand: "Earth Supply",
    currentInventory: 13,
  },
  {
    categories: ["on sale", "wellness"],
    name: "Body Scrubber",
    price: "120",
    image: "../images/products/split.png",
    description: "Treat and clean your skin without clogging pores.",
    brand: "Earth Supply",
    currentInventory: 13,
  },
  {
    categories: ["wellness"],
    name: "Candle Holder",
    price: "120",
    image: "../images/products/split.png",
    description: "Perfect for any room to create ambiance and serenity.",
    brand: "Earth Supply",
    currentInventory: 33,
  },
  {
    categories: ["on sale", "wellness"],
    name: "Bath Crystals",
    price: "80",
    image: "../images/products/bathcrystals.png",
    description: "Treat and clean your skin without clogging pores.",
    brand: "Earth Supply",
    currentInventory: 33,
  },
  {
    categories: ["on sale", "wellness"],
    name: "Pineapple Body Scrubber",
    price: "80",
    image: "../images/products/pscrubber.png",
    description:
      "Pinapple flavored scrub. Treat and clean your skin without clogging pores.",
    brand: "Jason Bourne",
    currentInventory: 33,
  },
  // {
]

inventory.map(i => {
  i.id = uuid()
  return i
})

export default inventory
