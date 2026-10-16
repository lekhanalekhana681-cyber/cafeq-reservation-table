import fs from "fs";
import path from "path";
import sharp from "sharp";

interface RawMenuItem {
  name: string;
  category: string;
  price: number;
  description: string;
  isVeg: boolean;
  isAlcoholic?: boolean;
  isAvailable?: boolean;
  tag?: string;
  prepTimeMinutes?: number;
  photoId?: string;
  localAsset?: string;
}

// -----------------------------------------------------------------------------
// Complete Menu Specifications (71 new items + existing items)
// -----------------------------------------------------------------------------
const MENU_DATA: RawMenuItem[] = [
  // ─── Hot Beverages ───
  {
    name: "Espresso",
    category: "Hot Beverages",
    price: 99,
    description: "Rich, concentrated double shot of pure single-origin Arabica espresso with golden crema.",
    isVeg: true,
    tag: "Classic",
    prepTimeMinutes: 3,
    photoId: "photo-1510591509098-f4fdc6d0ff04",
  },
  {
    name: "Cappuccino",
    category: "Hot Beverages",
    price: 149,
    description: "Balanced double espresso topped with equal parts steamed milk and dense velvety foam.",
    isVeg: true,
    tag: "Popular",
    prepTimeMinutes: 4,
    photoId: "photo-1572442388796-11668a67e53d",
  },
  {
    name: "Cafe Latte",
    category: "Hot Beverages",
    price: 159,
    description: "Smooth espresso balanced with silky textured steamed milk and delicate microfoam art.",
    isVeg: true,
    prepTimeMinutes: 4,
    photoId: "photo-1561882468-9110e03e0f78",
  },
  {
    name: "Filter Coffee",
    category: "Hot Beverages",
    price: 79,
    description: "Traditional South Indian decoction brewed with chicory and frothed full-cream milk.",
    isVeg: true,
    tag: "Traditional",
    prepTimeMinutes: 3,
    photoId: "photo-1517256064527-09c73fc73e38",
  },
  {
    name: "Hot Chocolate",
    category: "Hot Beverages",
    price: 169,
    description: "Melted rich dark Belgian chocolate whisked with creamy steamed milk and mini marshmallows.",
    isVeg: true,
    tag: "Favorite",
    prepTimeMinutes: 5,
    photoId: "photo-1542990253-0d0f5be5f0ed",
  },
  {
    name: "Masala Chai",
    category: "Hot Beverages",
    price: 59,
    description: "Aromatic slow-brewed tea infused with crushed green cardamom, ginger, cinnamon, and cloves.",
    isVeg: true,
    tag: "Desi Special",
    prepTimeMinutes: 4,
    photoId: "photo-1576092768241-dec231879fc3",
  },
  {
    name: "Green Tea",
    category: "Hot Beverages",
    price: 79,
    description: "Pure organic steamed whole green tea leaves with delicate floral undertones and antioxidants.",
    isVeg: true,
    prepTimeMinutes: 3,
    photoId: "photo-1627435601361-ec25f5b1d0e5",
  },
  {
    name: "Caramel Macchiato",
    category: "Hot Beverages",
    price: 189,
    description: "Freshly steamed vanilla milk marked with bold espresso and topped with buttery caramel drizzle.",
    isVeg: true,
    tag: "Sweet & Bold",
    prepTimeMinutes: 5,
    photoId: "photo-1485808191679-5f86510681a2",
  },

  // ─── Cold Beverages ───
  {
    name: "Cold Coffee",
    category: "Cold Beverages",
    price: 159,
    description: "Blended double espresso with chilled milk, dairy cream, and crushed crystal ice.",
    isVeg: true,
    tag: "All-Time Best",
    prepTimeMinutes: 4,
    photoId: "photo-1517701550927-30cf4ba1dba5",
  },
  {
    name: "Iced Latte",
    category: "Cold Beverages",
    price: 169,
    description: "Chilled fresh milk and espresso poured over clear artisan ice blocks.",
    isVeg: true,
    prepTimeMinutes: 3,
    photoId: "photo-1517256064527-09c73fc73e38",
  },
  {
    name: "Iced Tea (Lemon/Peach)",
    category: "Cold Beverages",
    price: 129,
    description: "Crisp slow-steeped Ceylon tea shaken with fresh lemon slices or ripe peach puree and mint.",
    isVeg: true,
    tag: "Refreshing",
    prepTimeMinutes: 3,
    photoId: "photo-1556679343-c7306c1976bc",
  },
  {
    name: "Oreo Milkshake",
    category: "Cold Beverages",
    price: 179,
    description: "Thick vanilla cream blended with crunchy Oreo cookies, dark fudge, and chocolate drizzle.",
    isVeg: true,
    tag: "Bestseller",
    prepTimeMinutes: 5,
    photoId: "photo-1572490122747-3968b75cc699",
  },
  {
    name: "Chocolate Milkshake",
    category: "Cold Beverages",
    price: 169,
    description: "Dutch cocoa and artisanal chocolate gelato churned into a rich, decadent shake.",
    isVeg: true,
    prepTimeMinutes: 5,
    photoId: "photo-1579954115563-e72bf1381629",
  },
  {
    name: "Mango Smoothie",
    category: "Cold Beverages",
    price: 159,
    description: "Pure Alphonso mango pulp churned with Greek yogurt, chia seeds, and wildflower honey.",
    isVeg: true,
    tag: "Seasonal",
    prepTimeMinutes: 4,
    photoId: "photo-1623065422902-30a2d299bbe4",
  },
  {
    name: "Fresh Lime Soda",
    category: "Cold Beverages",
    price: 89,
    description: "Effervescent club soda with freshly hand-squeezed limes, rock salt, and mint sprigs.",
    isVeg: true,
    prepTimeMinutes: 2,
    photoId: "photo-1513558161293-cdaf765ed2fd",
  },
  {
    name: "Cold Brew",
    category: "Cold Beverages",
    price: 179,
    description: "Single-origin Arabica grounds slow-steeped for 18 hours for maximum chocolatey smoothness.",
    isVeg: true,
    tag: "Signature",
    prepTimeMinutes: 2,
    photoId: "photo-1517701550927-30cf4ba1dba5",
  },

  // ─── Mocktails ───
  {
    name: "Virgin Mojito",
    category: "Mocktails",
    price: 149,
    description: "Muddled fresh garden mint, Persian lime wedges, raw cane sugar, and sparkling soda.",
    isVeg: true,
    tag: "Top Mocktail",
    prepTimeMinutes: 4,
    photoId: "photo-1551024709-8f23befc6f87",
  },
  {
    name: "Blue Lagoon",
    category: "Mocktails",
    price: 159,
    description: "Vibrant blue Curacao cordial, fresh lemon juice, and effervescent fizz over crushed ice.",
    isVeg: true,
    tag: "Colorful",
    prepTimeMinutes: 4,
    photoId: "photo-1551538827-9c037cb4f32a",
  },
  {
    name: "Watermelon Cooler",
    category: "Mocktails",
    price: 149,
    description: "Freshly pressed chilled watermelon juice, sweet basil seeds, lime squeeze, and mint.",
    isVeg: true,
    prepTimeMinutes: 4,
    photoId: "photo-1589733955941-5eeaf752f6dd",
  },
  {
    name: "Fruit Punch",
    category: "Mocktails",
    price: 159,
    description: "Tropical blend of orange, pineapple, mango, and pomegranate with a dash of sweet grenadine.",
    isVeg: true,
    prepTimeMinutes: 4,
    photoId: "photo-1546171753-97d7676e4602",
  },
  {
    name: "Cucumber Mint Cooler",
    category: "Mocktails",
    price: 139,
    description: "Crisp organic cucumber ribbons, fresh garden spearmint, lime juice, and sparkling soda.",
    isVeg: true,
    tag: "Detox",
    prepTimeMinutes: 4,
    photoId: "photo-1560512823-829485b8bf24",
  },
  {
    name: "Pina Colada (Virgin)",
    category: "Mocktails",
    price: 179,
    description: "Lush tropical coconut cream blended with ripe pineapple juice and crushed ice.",
    isVeg: true,
    prepTimeMinutes: 5,
    photoId: "photo-1546171753-97d7676e4602",
  },
  {
    name: "Strawberry Fizz",
    category: "Mocktails",
    price: 159,
    description: "Macerated fresh strawberries, tart lime juice, and crisp bubbly sparkling water.",
    isVeg: true,
    prepTimeMinutes: 4,
    photoId: "photo-1568644396922-5c3bfae12521",
  },
  {
    name: "Green Apple Spritzer",
    category: "Mocktails",
    price: 149,
    description: "Crisp Granny Smith apple nectar, crushed mint leaves, and effervescent sparkling soda.",
    isVeg: true,
    prepTimeMinutes: 4,
    photoId: "photo-1513558161293-cdaf765ed2fd",
  },

  // ─── Cocktails (18+) ───
  {
    name: "Classic Mojito",
    category: "Cocktails (18+)",
    price: 349,
    description: "Premium white rum, muddled garden mint, fresh lime, raw sugar, and sparkling soda.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ Only",
    prepTimeMinutes: 5,
    photoId: "photo-1551024709-8f23befc6f87",
  },
  {
    name: "Margarita",
    category: "Cocktails (18+)",
    price: 379,
    description: "Blanco agave tequila, orange triple sec, and freshly squeezed tart lime juice with salted rim.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ Only",
    prepTimeMinutes: 5,
    photoId: "photo-1514362545857-3bc16c4c7d1b",
  },
  {
    name: "Long Island Iced Tea",
    category: "Cocktails (18+)",
    price: 449,
    description: "Potent blend of vodka, rum, tequila, gin, triple sec, sour mix, and splash of cola.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ High Proof",
    prepTimeMinutes: 5,
    photoId: "photo-1514362545857-3bc16c4c7d1b",
  },
  {
    name: "Cosmopolitan",
    category: "Cocktails (18+)",
    price: 399,
    description: "Citron vodka, orange liqueur, cranberry nectar, and fresh lime shaken ice-cold.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ Only",
    prepTimeMinutes: 5,
    photoId: "photo-1551538827-9c037cb4f32a",
  },
  {
    name: "Pina Colada",
    category: "Cocktails (18+)",
    price: 379,
    description: "Golden Caribbean spiced rum, rich coconut cream, and pineapple juice blended to smooth bliss.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ Only",
    prepTimeMinutes: 5,
    photoId: "photo-1546171753-97d7676e4602",
  },
  {
    name: "Whiskey Sour",
    category: "Cocktails (18+)",
    price: 399,
    description: "Aged Kentucky bourbon whiskey, freshly squeezed lemon juice, simple syrup, and Angostura bitters.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ Bar Special",
    prepTimeMinutes: 5,
    photoId: "photo-1514362545857-3bc16c4c7d1b",
  },
  {
    name: "Sangria (Glass)",
    category: "Cocktails (18+)",
    price: 349,
    description: "Bold Spanish red wine steeped with macerated oranges, berries, apples, and a splash of brandy.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ Wine Cocktail",
    prepTimeMinutes: 4,
    photoId: "photo-1510812431401-41d2bd2722f3",
  },
  {
    name: "Old Fashioned",
    category: "Cocktails (18+)",
    price: 429,
    description: "Straight bourbon whiskey slowly stirred with raw sugar cube, aromatic bitters, and expressed orange peel.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ Vintage",
    prepTimeMinutes: 5,
    photoId: "photo-1470337458703-46ad1756a187",
  },
  {
    name: "Tequila Sunrise",
    category: "Cocktails (18+)",
    price: 369,
    description: "Blue agave tequila and freshly pressed orange juice with sinking sweet pomegranate grenadine.",
    isVeg: true,
    isAlcoholic: true,
    tag: "18+ Only",
    prepTimeMinutes: 4,
    photoId: "photo-1536935338788-846bb9981813",
  },

  // ─── Momos (6 pcs) ───
  {
    name: "Veg Steamed Momos",
    category: "Momos (6 pcs)",
    price: 119,
    description: "Delicate thin-wrapper Himalayan dumplings filled with finely chopped cabbage, carrots, and scallions.",
    isVeg: true,
    tag: "Steamed",
    prepTimeMinutes: 10,
    photoId: "photo-1625220194771-7ebdea0b70b9",
  },
  {
    name: "Chicken Steamed Momos",
    category: "Momos (6 pcs)",
    price: 149,
    description: "Juicy minced chicken seasoned with coriander, ginger, garlic, and Himalayan spices.",
    isVeg: false,
    tag: "Bestseller",
    prepTimeMinutes: 10,
    photoId: "photo-1496116218417-1a781b1c416c",
  },
  {
    name: "Paneer Momos",
    category: "Momos (6 pcs)",
    price: 139,
    description: "Fresh grated cottage cheese, garden herbs, and mild ground spices in soft steamed parcels.",
    isVeg: true,
    prepTimeMinutes: 10,
    photoId: "photo-1625220194771-7ebdea0b70b9",
  },
  {
    name: "Veg Fried Momos",
    category: "Momos (6 pcs)",
    price: 139,
    description: "Crispy golden fried vegetable momos served with fiery red chili garlic chutney.",
    isVeg: true,
    tag: "Crunchy",
    prepTimeMinutes: 12,
    photoId: "photo-1541696432-82c6da8ce7bf",
  },
  {
    name: "Chicken Fried Momos",
    category: "Momos (6 pcs)",
    price: 169,
    description: "Deep golden crisp chicken dumplings served with spicy Schezwan dip and garlic mayo.",
    isVeg: false,
    prepTimeMinutes: 12,
    photoId: "photo-1541696432-82c6da8ce7bf",
  },
    {
    name: "Cheese Corn Momos",
    category: "Momos (6 pcs)",
    price: 149,
    description: "Gooey mozzarella cheese and sweet golden American corn kernels stuffed in tender dumplings.",
    isVeg: true,
    prepTimeMinutes: 10,
    photoId: "photo-1625220194771-7ebdea0b70b9",
  },
  {
    name: "Schezwan Chicken Momos",
    category: "Momos (6 pcs)",
    price: 179,
    description: "Wok-tossed chicken momos coated in spicy, tangy garlic Schezwan gravy with scallions.",
    isVeg: false,
    tag: "Spicy",
    prepTimeMinutes: 12,
    photoId: "photo-1563245372-f21724e3856d",
  },
  {
    name: "Chocolate Momos (dessert)",
    category: "Momos (6 pcs)",
    price: 129,
    description: "Sweet golden crispy momos filled with molten Belgian dark chocolate and roasted almond slivers.",
    isVeg: true,
    tag: "Dessert Momo",
    prepTimeMinutes: 8,
    photoId: "photo-1578985545062-69928b1d9587",
  },

  // ─── Starters & Snacks ───
  {
    name: "French Fries",
    category: "Starters & Snacks",
    price: 99,
    description: "Hand-cut crispy golden potato fries seasoned with sea salt, served with garlic aioli.",
    isVeg: true,
    tag: "Classic Snack",
    prepTimeMinutes: 8,
    localAsset: "fries.jpg",
  },
  {
    name: "Peri Peri Fries",
    category: "Starters & Snacks",
    price: 129,
    description: "Crunchy potato fries generously dusted with zesty, hot African peri-peri chili rub.",
    isVeg: true,
    tag: "Spicy Kick",
    prepTimeMinutes: 8,
    photoId: "photo-1573080496219-bb080dd4f877",
  },
  {
    name: "Cheese Nachos",
    category: "Starters & Snacks",
    price: 159,
    description: "Warm stone-ground tortilla chips topped with molten cheddar cheese sauce, salsa, and jalapenos.",
    isVeg: true,
    prepTimeMinutes: 8,
    photoId: "photo-1513456852971-30c0b8199d4d",
  },
  {
    name: "Veg Spring Rolls",
    category: "Starters & Snacks",
    price: 129,
    description: "Crispy fried pastry rolls filled with wok-tossed shredded cabbage, bell peppers, and glass noodles.",
    isVeg: true,
    prepTimeMinutes: 10,
    photoId: "photo-1544025162-d76694265947",
  },
  {
    name: "Paneer Tikka",
    category: "Starters & Snacks",
    price: 219,
    description: "Charcoal-grilled cottage cheese cubes marinated in Kashmiri chili, hung curd, and spices.",
    isVeg: true,
    tag: "Tandoor Special",
    prepTimeMinutes: 14,
    photoId: "photo-1567188040759-fb8a883dc6d8",
  },
      {
    name: "Crispy Corn",
    category: "Starters & Snacks",
    price: 149,
    description: "Golden sweet corn kernels flash-fried and wok-tossed with green chilies, peppers, and chaat masala.",
    isVeg: true,
    prepTimeMinutes: 8,
    photoId: "photo-1551754655-cd27e38d2076",
  },

  // ─── Burgers & Sandwiches ───
  {
    name: "Veg Burger",
    category: "Burgers & Sandwiches",
    price: 129,
    description: "Crisp seasoned veggie patty, fresh iceberg lettuce, sliced tomato, and herb mayo on a sesame bun.",
    isVeg: true,
    prepTimeMinutes: 10,
    localAsset: "burger.jpg",
  },
  {
    name: "Chicken Burger",
    category: "Burgers & Sandwiches",
    price: 169,
    description: "Tender grilled chicken fillet, sharp vintage cheddar, dill pickles, and honey mustard sauce.",
    isVeg: false,
    tag: "Popular",
    prepTimeMinutes: 12,
    photoId: "photo-1568901346375-23c9450c58cd",
  },
  {
    name: "Paneer Burger",
    category: "Burgers & Sandwiches",
    price: 159,
    description: "Crispy crumbed spiced paneer patty topped with chipotle coleslaw and fresh greens.",
    isVeg: true,
    prepTimeMinutes: 10,
    photoId: "photo-1550547660-d9450f859349",
  },
  {
    name: "Grilled Veg Sandwich",
    category: "Burgers & Sandwiches",
    price: 119,
    description: "Toasted multi-grain bread layered with sliced cucumber, tomato, bell pepper, and spicy mint chutney.",
    isVeg: true,
    prepTimeMinutes: 8,
    localAsset: "sandwich.jpg",
  },
  {
    name: "Club Sandwich",
    category: "Burgers & Sandwiches",
    price: 179,
    description: "Triple-decker toasted sandwich with layered grilled vegetables, cheddar cheese, and house aioli.",
    isVeg: true,
    tag: "Hearty",
    prepTimeMinutes: 10,
    photoId: "photo-1528735602780-2552fd46c7af",
  },
  {
    name: "Chicken Tikka Sandwich",
    category: "Burgers & Sandwiches",
    price: 169,
    description: "Juicy tandoori chicken tikka pieces, red onion rings, and mint mayonnaise between grilled bread.",
    isVeg: false,
    prepTimeMinutes: 10,
    photoId: "photo-1509722747041-616f39b57569",
  },
  
  // ─── Pizza & Pasta ───
  {
    name: "Margherita Pizza",
    category: "Pizza & Pasta",
    price: 249,
    description: "Classic hand-stretched crust topped with San Marzano tomato sauce, fresh mozzarella, and sweet basil.",
    isVeg: true,
    tag: "Italian Classic",
    prepTimeMinutes: 15,
    localAsset: "pizza.jpg",
  },
  {
    name: "Farmhouse Pizza",
    category: "Pizza & Pasta",
    price: 299,
    description: "Loaded with roasted bell peppers, sliced red onions, button mushrooms, sweet corn, and black olives.",
    isVeg: true,
    prepTimeMinutes: 15,
    photoId: "photo-1565299624946-b28f40a0ae38",
  },
  {
    name: "Pepperoni Pizza",
    category: "Pizza & Pasta",
    price: 349,
    description: "Crispy crust layered with tomato sauce, mozzarella, and cured spicy pepperoni slices.",
    isVeg: false,
    tag: "House Special",
    prepTimeMinutes: 15,
    photoId: "photo-1628840042765-356cda07504e",
  },
    {
    name: "Red Sauce Pasta",
    category: "Pizza & Pasta",
    price: 209,
    description: "Penne tossed in spicy slow-cooked San Marzano tomato, garlic, and fresh basil arrabbiata sauce.",
    isVeg: true,
    prepTimeMinutes: 12,
    photoId: "photo-1551183053-bf91a1d81141",
  },
  {
    name: "Chicken Alfredo Pasta",
    category: "Pizza & Pasta",
    price: 269,
    description: "Fettuccine pasta tossed with tender grilled chicken breast strips in rich aged Parmesan alfredo.",
    isVeg: false,
    tag: "Bestseller",
    prepTimeMinutes: 14,
    photoId: "photo-1645112411341-6c4fd023714a",
  },
  {
    name: "Mac and Cheese",
    category: "Pizza & Pasta",
    price: 229,
    description: "Elbow macaroni enveloped in creamy triple-blend cheddar and Gruyere cheese, finished with crunchy herb crumbs.",
    isVeg: true,
    tag: "Comfort Food",
    prepTimeMinutes: 12,
    photoId: "photo-1543339308-43e59d6b73a6",
  },

  // ─── Desserts ───
  {
    name: "Brownie with Ice Cream",
    category: "Desserts",
    price: 169,
    description: "Warm fudgy Belgian dark chocolate brownie served with Madagascar vanilla gelato and hot fudge.",
    isVeg: true,
    tag: "All-Time Favorite",
    prepTimeMinutes: 6,
    localAsset: "brownie.jpg",
  },
  {
    name: "Chocolate Lava Cake",
    category: "Desserts",
    price: 159,
    description: "Warm dark cocoa sponge cake with an irresistible molten liquid chocolate core.",
    isVeg: true,
    tag: "Molten Center",
    prepTimeMinutes: 6,
    photoId: "photo-1606313564200-e75d5e30476c",
  },
  {
    name: "Cheesecake Slice",
    category: "Desserts",
    price: 189,
    description: "Silky New York style baked cheesecake on a buttery biscuit base, served with berry coulis.",
    isVeg: true,
    prepTimeMinutes: 3,
    photoId: "photo-1533134242443-d4fd215305ad",
  },
  {
    name: "Tiramisu",
    category: "Desserts",
    price: 199,
    description: "Authentic Italian recipe with espresso-soaked savoiardi ladyfingers and whipped mascarpone cream.",
    isVeg: true,
    tag: "Authentic",
    prepTimeMinutes: 3,
    photoId: "photo-1571877227200-a0d98ea607e9",
  },
  {
    name: "Waffle with Nutella",
    category: "Desserts",
    price: 179,
    description: "Freshly ironed golden Belgian waffle loaded with creamy Nutella, sliced banana, and whipped cream.",
    isVeg: true,
    prepTimeMinutes: 8,
    photoId: "photo-1562376552-0d160a2f238d",
  },
  {
    name: "Vanilla/Chocolate Scoop",
    category: "Desserts",
    price: 79,
    description: "Two generous scoops of artisanal churned gelato (choice of Bourbon vanilla or Belgian dark cocoa).",
    isVeg: true,
    prepTimeMinutes: 2,
    photoId: "photo-1501443762994-82bd5dace89a",
  },
  {
    name: "Banoffee Pie",
    category: "Desserts",
    price: 189,
    description: "Classic English dessert with fresh bananas, thick caramel toffee dulce de leche, and whipped cream.",
    isVeg: true,
    prepTimeMinutes: 3,
    photoId: "photo-1519869325930-281384150729",
  },

  // ─── Existing Items Preserved (Updated to full INR & WebP images) ───
  {
    name: "Velvet Cappuccino",
    category: "Coffee & Drinks",
    price: 149,
    description: "Rich double espresso with thick velvety microfoam & dusted cocoa.",
    isVeg: true,
    tag: "Popular",
    prepTimeMinutes: 4,
    photoId: "photo-1572442388796-11668a67e53d",
  },
  {
    name: "Artisan Vanilla Bean Latte",
    category: "Coffee & Drinks",
    price: 169,
    description: "Double shot espresso, Madagascar vanilla, silky steamed milk.",
    isVeg: true,
    tag: "Signature",
    prepTimeMinutes: 5,
    photoId: "photo-1561882468-9110e03e0f78",
  },
  {
    name: "Ember Flat White",
    category: "Coffee & Drinks",
    price: 159,
    description: "Double ristretto, microfoam with house Ethiopian blend.",
    isVeg: true,
    prepTimeMinutes: 4,
    photoId: "photo-1517256064527-09c73fc73e38",
  },
  {
    name: "Cardamom Honey Latte",
    category: "Coffee & Drinks",
    price: 179,
    description: "Crushed green cardamom, wildflower honey, oat or dairy milk.",
    isVeg: true,
    prepTimeMinutes: 5,
    photoId: "photo-1541167760496-1628856ab772",
  },
  {
    name: "24h Slow Cold Brew",
    category: "Coffee & Drinks",
    price: 179,
    description: "Slow steeped micro-lot poured over a single clear ice block.",
    isVeg: true,
    prepTimeMinutes: 2,
    photoId: "photo-1517701550927-30cf4ba1dba5",
  },
  {
    name: "Ceremonial Matcha Tonic",
    category: "Coffee & Drinks",
    price: 199,
    description: "Uji ceremonial matcha, premium tonic, sparkling yuzu twist.",
    isVeg: true,
    prepTimeMinutes: 4,
    photoId: "photo-1536256263959-770b48d82b0a",
  },
  {
    name: "Dark Belgian Iced Chocolate",
    category: "Coffee & Drinks",
    price: 189,
    description: "70% single origin cocoa, cold cream, roasted cacao nibs.",
    isVeg: true,
    prepTimeMinutes: 3,
    photoId: "photo-1542990253-0d0f5be5f0ed",
  },
  {
    name: "Warm Fudgy Brownie & Gelato",
    category: "Bakery & Desserts",
    price: 169,
    description: "Decadent dark chocolate brownie with molten core & vanilla bean gelato.",
    isVeg: true,
    tag: "Chef's Special",
    prepTimeMinutes: 6,
    localAsset: "brownie.jpg",
  },
  {
    name: "Golden Butter Croissant",
    category: "Bakery & Desserts",
    price: 129,
    description: "72-hour laminated French pastry, baked fresh at 6am daily.",
    isVeg: true,
    tag: "Sells out",
    prepTimeMinutes: 2,
    photoId: "photo-1555507036-ab1f4038808a",
  },
  {
    name: "Cardamom Orange Knot",
    category: "Bakery & Desserts",
    price: 139,
    description: "Braided Swedish bun with freshly ground cardamom & orange zest.",
    isVeg: true,
    prepTimeMinutes: 2,
    photoId: "photo-1509440159596-0249088772ff",
  },
    {
    name: "Artisanal Margherita Sourdough Pizza",
    category: "Artisanal Mains",
    price: 289,
    description: "48h fermented sourdough crust, San Marzano sauce, fresh mozzarella, torn basil.",
    isVeg: true,
    tag: "Wood-fired",
    prepTimeMinutes: 16,
    localAsset: "pizza.jpg",
  },
  {
    name: "Gourmet Brioche Cafe Burger",
    category: "Artisanal Mains",
    price: 269,
    description: "Juicy patty (or crispy paneer), melted vintage cheddar, caramelized onions, truffle sauce.",
    isVeg: true,
    tag: "Must Try",
    prepTimeMinutes: 14,
    localAsset: "burger.jpg",
  },
  {
    name: "Toasted Sourdough Club Sandwich",
    category: "Artisanal Mains",
    price: 239,
    description: "Triple-decker sourdough with herb grilled fillings, avocado, heirloom tomato, aioli.",
    isVeg: true,
    prepTimeMinutes: 10,
    localAsset: "sandwich.jpg",
  },
  {
    name: "Avocado & Dukkah Sourdough Toast",
    category: "Artisanal Mains",
    price: 229,
    description: "Hand-smashed Hass avocado, Egyptian dukkah spice, extra virgin lemon oil.",
    isVeg: true,
    tag: "Vegan",
    prepTimeMinutes: 8,
    photoId: "photo-1525351484163-7529414344d8",
  },
  {
    name: "Small-Batch Skillet Shakshuka",
    category: "Artisanal Mains",
    price: 269,
    description: "Slow-simmered spiced tomatoes, poached eggs, whipped feta & warm focaccia.",
    isVeg: false,
    prepTimeMinutes: 15,
    photoId: "photo-1590412200988-a436970781fa",
  },
  {
    name: "Crispy Herb & Truffle Fries",
    category: "Bites & Sides",
    price: 139,
    description: "Golden hand-cut fries tossed in fresh rosemary, sea salt, served with truffle mayo.",
    isVeg: true,
    tag: "Crispy",
    prepTimeMinutes: 8,
    localAsset: "fries.jpg",
  },
  {
    name: "Vibrant Seasonal Fruit Bowl",
    category: "Fresh & Bowls",
    price: 169,
    description: "Fresh dragonfruit, strawberries, blueberries, kiwi, Greek yogurt & passionfruit drizzle.",
    isVeg: true,
    tag: "Healthy",
    prepTimeMinutes: 5,
    localAsset: "fruit-bowl.jpg",
  },
  {
    name: "Roasted Maple Granola Bowl",
    category: "Fresh & Bowls",
    price: 179,
    description: "House-toasted oats, nuts, organic yogurt, roasted stone fruits and chia seeds.",
    isVeg: true,
    prepTimeMinutes: 4,
    photoId: "photo-1511690656952-34342bb7c2f2",
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

async function createPlaceholderImage(targetPaths: string[]) {
  // SVG placeholder with warm modern cafe styling
  const svg = `
    <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1c1917"/>
          <stop offset="50%" stop-color="#292524"/>
          <stop offset="100%" stop-color="#0c0a09"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f97316"/>
          <stop offset="100%" stop-color="#ea580c"/>
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#bg)"/>
      <circle cx="400" cy="270" r="90" fill="#292524" stroke="#44403c" stroke-width="2"/>
      <!-- Coffee Cup & Fork Emblem -->
      <path d="M355 260 h70 v25 c0 20 -15 35 -35 35 s-35 -15 -35 -35 Z" fill="none" stroke="url(#accent)" stroke-width="6" stroke-linecap="round"/>
      <path d="M425 265 h12 c10 0 18 8 18 18 s-8 18 -18 18 h-12" fill="none" stroke="url(#accent)" stroke-width="5"/>
      <path d="M375 240 c0 -15 8 -25 8 -35 M395 240 c0 -15 8 -25 8 -35 M415 240 c0 -15 8 -25 8 -35" fill="none" stroke="#fdba74" stroke-width="3" stroke-linecap="round"/>
      <text x="400" y="420" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="#fafaf9" text-anchor="middle" letter-spacing="2">
        CafeQ GOURMET
      </text>
      <text x="400" y="455" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400" fill="#a8a29e" text-anchor="middle">
        Freshly Handcrafted in Our Kitchen
      </text>
    </svg>
  `;

  const webpBuffer = await sharp(Buffer.from(svg))
    .resize(800, 600)
    .webp({ quality: 85 })
    .toBuffer();

  for (const p of targetPaths) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, webpBuffer);
  }
}

async function processImage(item: RawMenuItem, targetWebpPaths: string[], placeholderPath: string): Promise<string> {
  const primaryPath = targetWebpPaths[0];

  // If already exists and is non-empty, keep it
  if (fs.existsSync(primaryPath) && fs.statSync(primaryPath).size > 1000) {
    for (let i = 1; i < targetWebpPaths.length; i++) {
      if (!fs.existsSync(targetWebpPaths[i])) {
        fs.copyFileSync(primaryPath, targetWebpPaths[i]);
      }
    }
    return `/uploads/menu/${path.basename(primaryPath)}`;
  }

  // 1. If local asset exists in src/assets
  if (item.localAsset) {
    const assetPath = path.resolve(process.cwd(), "src", "assets", item.localAsset);
    if (fs.existsSync(assetPath)) {
      try {
        const buf = await sharp(assetPath)
          .resize(800, 600, { fit: "cover", position: "center" })
          .webp({ quality: 80 })
          .toBuffer();

        for (const tp of targetWebpPaths) {
          fs.writeFileSync(tp, buf);
        }
        console.log(`✓ Converted local asset for ${item.name} -> ${path.basename(primaryPath)}`);
        return `/uploads/menu/${path.basename(primaryPath)}`;
      } catch (err) {
        console.warn(`Local asset processing failed for ${item.name}:`, err);
      }
    }
  }

  // 2. Download from royalty-free Unsplash CDN
  if (item.photoId) {
    const unsplashUrl = `https://images.unsplash.com/${item.photoId}?auto=format&fit=crop&w=800&h=600&q=80`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(unsplashUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = await sharp(Buffer.from(arrayBuf))
          .resize(800, 600, { fit: "cover", position: "center" })
          .webp({ quality: 80 })
          .toBuffer();

        for (const tp of targetWebpPaths) {
          fs.writeFileSync(tp, buf);
        }
        console.log(`✓ Downloaded & converted WebP for ${item.name} (800x600)`);
        return `/uploads/menu/${path.basename(primaryPath)}`;
      }
    } catch (err) {
      console.warn(`! Unsplash fetch failed for ${item.name}, using fallback placeholder.`);
    }
  }

  // 3. Fallback to placeholder
  if (fs.existsSync(placeholderPath)) {
    const placeholderBuf = fs.readFileSync(placeholderPath);
    for (const tp of targetWebpPaths) {
      fs.writeFileSync(tp, placeholderBuf);
    }
  }
  return `/uploads/menu/${path.basename(primaryPath)}`;
}

async function main() {
  console.log("=========================================");
  console.log("CafeQ Menu Seeding & WebP Image Processor");
  console.log("=========================================");

  const publicUploads = path.resolve(process.cwd(), "public", "uploads", "menu");
  const rootUploads = path.resolve(process.cwd(), "uploads", "menu");

  fs.mkdirSync(publicUploads, { recursive: true });
  fs.mkdirSync(rootUploads, { recursive: true });

  const placeholderPublic = path.resolve(publicUploads, "placeholder.webp");
  const placeholderRoot = path.resolve(rootUploads, "placeholder.webp");

  console.log("Creating default fallback placeholder image...");
  await createPlaceholderImage([placeholderPublic, placeholderRoot]);
  console.log("✓ Placeholder generated at /uploads/menu/placeholder.webp");

  // Process all items in batch
  const processedItems = [];
  const processedNames = new Set<string>();

  for (const item of MENU_DATA) {
    if (processedNames.has(item.name.toLowerCase())) {
      continue; // Idempotent check
    }
    processedNames.add(item.name.toLowerCase());

    const slug = slugify(item.name);
    const filename = `${slug}.webp`;
    const targetPublic = path.resolve(publicUploads, filename);
    const targetRoot = path.resolve(rootUploads, filename);

    const imagePath = await processImage(item, [targetPublic, targetRoot], placeholderPublic);

    processedItems.push({
      id: slug,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      isVeg: item.isVeg,
      isAlcoholic: !!item.isAlcoholic,
      isAvailable: true,
      tag: item.tag || (item.isAlcoholic ? "18+" : undefined),
      image: imagePath,
      prepTimeMinutes: item.prepTimeMinutes || 5,
    });
  }

  console.log(`\nProcessed ${processedItems.length} menu items total.`);

  // ---------------------------------------------------------------------------
  // Generate src/data/menu.ts (Idempotent: preserves structure, types, tableTypes)
  // ---------------------------------------------------------------------------
  const distinctCategories = Array.from(new Set(processedItems.map((i) => i.category)));

  const menuTsContent = `// CafeQ Gourmet Menu Data
// Auto-generated by scripts/seed-menu.ts
// Fully idempotent: updates existing items and adds new items with 800x600 WebP images

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  isVeg: boolean;
  isAlcoholic?: boolean;
  isAvailable?: boolean;
  tag?: string;
  image?: string;
  prepTimeMinutes: number;
};

export const menu: MenuItem[] = ${JSON.stringify(processedItems, null, 2)};

export const categories = ${JSON.stringify(distinctCategories, null, 2)} as const;

export type TableType = {
  id: string;
  name: string;
  description: string;
  minCapacity: number;
  maxCapacity: number;
  totalTables: number;
  tag: string;
};

export const tableTypes: TableType[] = [
  {
    id: "window",
    name: "Window 2-Top",
    description: "Sunlit street-view table with natural wood finish. Ideal for couples or solo coffee.",
    minCapacity: 1,
    maxCapacity: 2,
    totalTables: 5,
    tag: "High Demand",
  },
  {
    id: "booth",
    name: "Cozy Dining Booth",
    description: "Plush upholstered booth with privacy and warm pendant lighting.",
    minCapacity: 2,
    maxCapacity: 4,
    totalTables: 4,
    tag: "Comfort",
  },
  {
    id: "courtyard",
    name: "Garden Courtyard",
    description: "Open-air patio with lush greenery and terracotta planters.",
    minCapacity: 2,
    maxCapacity: 6,
    totalTables: 4,
    tag: "Outdoor",
  },
  {
    id: "communal",
    name: "Long Communal Table",
    description: "Solid oak shared table with ample power outlets and spacious seating.",
    minCapacity: 1,
    maxCapacity: 8,
    totalTables: 6,
    tag: "Work & Social",
  },
  {
    id: "counter",
    name: "Espresso Bar Stools",
    description: "Front-row marble counter overlooking the espresso bar and roastery.",
    minCapacity: 1,
    maxCapacity: 2,
    totalTables: 6,
    tag: "Quick Brew",
  },
];
`;

  fs.writeFileSync(path.resolve(process.cwd(), "src", "data", "menu.ts"), menuTsContent, "utf-8");
  console.log("✓ Updated src/data/menu.ts with full menu items, categories, and types.");

  // Write JSON artifact to public/menu.json for client storage synchronization
  fs.writeFileSync(
    path.resolve(process.cwd(), "public", "menu.json"),
    JSON.stringify(processedItems, null, 2),
    "utf-8"
  );
  console.log("✓ Generated public/menu.json");

  // ---------------------------------------------------------------------------
  // Generate Supabase Idempotent SQL Seed (UPSERT on name)
  // ---------------------------------------------------------------------------
  const sqlStatements = processedItems.map((item) => {
    const escName = item.name.replace(/'/g, "''");
    const escCat = item.category.replace(/'/g, "''");
    const escDesc = item.description.replace(/'/g, "''");
    const escTag = item.tag ? `'${item.tag.replace(/'/g, "''")}'` : "NULL";
    return `INSERT INTO menu_items (name, category, price, description, is_veg, is_alcoholic, is_available, image_url, tag, prep_time_minutes, updated_at)
VALUES ('${escName}', '${escCat}', ${item.price}, '${escDesc}', ${item.isVeg}, ${item.isAlcoholic}, ${item.isAvailable}, '${item.image}', ${escTag}, ${item.prepTimeMinutes}, NOW())
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  is_veg = EXCLUDED.is_veg,
  is_alcoholic = EXCLUDED.is_alcoholic,
  is_available = EXCLUDED.is_available,
  image_url = EXCLUDED.image_url,
  tag = EXCLUDED.tag,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  updated_at = NOW();`;
  });

  const sqlContent = `-- Idempotent Menu Items Seed
-- Generated on ${new Date().toISOString()}

-- Ensure columns exist in menu_items
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS is_veg BOOLEAN DEFAULT TRUE;
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS is_alcoholic BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS tag VARCHAR;

-- Ensure unique constraint on name for UPSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_name_key'
  ) THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_name_key UNIQUE (name);
  END IF;
END $$;

${sqlStatements.join("\n\n")}
`;

  fs.writeFileSync(path.resolve(process.cwd(), "supabase", "seed_menu.sql"), sqlContent, "utf-8");
  console.log("✓ Generated supabase/seed_menu.sql");

  console.log("=========================================");
  console.log("Seeding complete! All 800x600 WebP photos ready under /uploads/menu/");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("Fatal error during menu seeding:", err);
  process.exit(1);
});
