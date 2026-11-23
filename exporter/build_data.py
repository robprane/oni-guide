#!/usr/bin/env python3
"""
Transforms exporter/out/raw_export.json (produced by the ONI C# exporter mod)
into clean, tag-driven site data files under data/.

Key guarantees:
- Preserves existing human-readable IDs and image mappings via exporter/id_map.json
  (bootstrapped from existing data/*.json on first run).
- Includes all active game entities (elements, buildings, critters, eggs, plants,
  seeds, foods, duplicants, geysers, items).
- Assigns clean tags to objects and groups multi-option recipes using `"tag"` entries
  so the frontend can expand 1 JSON recipe into a group of concrete recipes and
  automatically include new objects tagged with the same tag.
"""

from __future__ import annotations

import glob
import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RAW_PATH = ROOT / "exporter" / "out" / "raw_export.json"
OVERRIDES_PATH = ROOT / "exporter" / "overrides.json"
ID_MAP_PATH = ROOT / "exporter" / "id_map.json"
DATA_DIR = ROOT / "data"
IMAGES_DIR = ROOT / "images"
MISSING_IMAGES_PATH = ROOT / "exporter" / "out" / "missing_images.txt"
ICON_MANIFEST_PATH = ROOT / "exporter" / "out" / "icon_manifest.json"

# Explicit known gameId -> legacy site id bridges where game names differ from older wiki names
KNOWN_GAME_TO_SITE_ID = {
    "Minion": "duplicant",
    "BionicMinion": "bionic_duplicant",
    "AirFilter": "deodorizer",
    "WaterPurifier": "water_sieve",
    "AlgaeHabitat": "algae_terrarium",
    "AlgaeDistillery": "algae_distiller",
    "Carbon": "coal",
    "ContaminatedOxygen": "polluted_oxygen",
    "DirtyWater": "polluted_water",
    "ToxicSand": "polluted_dirt",
    "ToxicMud": "polluted_mud",
    "SlimeMold": "slime",
    "BasicSingleHarvestPlant": "mealwood",
    "BasicPlantFood": "meal_lice",
    "PrickleFlower": "bristle_blossom",
    "PrickleFruit": "bristle_berry",
    "GrilledPrickleFruit": "gristle_berry",
    "MushroomPlant": "dusk_cap",
    "ColdWheat": "sleet_wheat",
    "ColdWheatSeed": "sleet_wheat_grain",
    "ForestTree": "arbor_tree",
    "SpaceTree": "bonbon_tree",
    "SwampHarvestPlant": "bog_bucket",
    "SwampFruit": "bog_jelly",
    "BlueGrass": "alveo_vera",
    "OxyRock": "oxylite",
    "BeanPlant": "nosh_sprout",
    "BeanPlantSeed": "nosh_bean",
    "SpiceVine": "pincha_pepperplant",
    "SpiceNut": "pincha_peppernut",
    "SaltPlant": "dasha_saltvine",
    "SeaLettuce": "waterweed",
    "CritterTrapPlant": "saturn_critter_trap",
    "CarrotPlant": "plume_squash_plant",
    "Carrot": "plume_squash",
    "HardSkinBerryPlant": "pikeapple_bush",
    "HardSkinBerry": "pikeapple",
    "HatchHard": "stone_hatch",
    "HatchMetal": "smooth_hatch",
    "HatchVeggie": "sage_hatch",
    "DreckoPlastic": "glossy_drecko",
    "PacuCleaner": "gulp_fish",
    "PacuTropical": "tropical_pacu",
    "Oilfloater": "slickster",
    "OilfloaterHighTemp": "molten_slickster",
    "OilfloaterDecor": "longhair_slickster",
    "LightBug": "shine_bug",
    "LightBugOrange": "sun_bug",
    "LightBugPurple": "royal_bug",
    "LightBugPink": "coral_bug",
    "LightBugBlue": "azure_bug",
    "LightBugBlack": "abyss_bug",
    "LightBugCrystal": "radiant_bug",
    "Squirrel": "pip",
    "SquirrelHug": "cuddle_pip",
    "Mole": "shove_vole",
    "MoleDelicacy": "delecta_vole",
    "Crab": "pokeshell",
    "CrabWood": "oakshell",
    "CrabFreshWater": "sanishell",
    "DivergentBeetle": "sweetle",
    "DivergentWorm": "grubgrub",
    "Staterpillar": "plug_slug",
    "StaterpillarGas": "smog_slug",
    "StaterpillarLiquid": "sponge_slug",
    "Moo": "gassy_moo",
    "IceBelly": "bammoth",
    "GoldBelly": "regal_bammoth",
    "WoodDeer": "flox",
    "GlassDeer": "shatter_flox",
    "Seal": "spigot_seal",
    "Glom": "morb",
    "BeeHive": "beeta_hive",
    "PuftAlpha": "puft_prince",
    "PuftOxylite": "dense_puft",
    "PuftBleachstone": "squeaky_puft",
    "PowerStationTools": "microchip",
    "FarmStationTools": "micronutrient_fertilizer",
    "Polypropylene": "plastic",
    "HardPolypropylene": "plastium",
    "Milk": "brackene",
    "MilkFat": "brackwax",
    "SugarWater": "nectar",
    "WoodLog": "wood",
    "Katairite": "abyssalite",
    "Cuprite": "copper_ore",
    "Cobaltite": "cobalt_ore",
    "Wolframite": "wolframite",
    "TempConductorSolid": "thermium",
    "SuperInsulator": "insulation",
    "SuperCoolant": "super_coolant",
    "ViscoGel": "visco_gel",
    "MilkFatSeparator": "brackwax_gleaner",
    "MilkFeeder": "critter_fountain",
    "MilkPress": "plant_pulverizer",
    "ChemicalRefinery": "emulsifier",
    "RubberMaker": "vulcanizer",
    "Chlorinator": "bleach_stone_hopper",
    "FoodDehydrator": "dehydrator",
    "FoodRehydrator": "rehydrator",
    "CraftingTable": "crafting_station",
    "AdvancedCraftingTable": "soldering_station",
    "CookingStation": "electric_grill",
    "GourmetCookingStation": "gas_range",
    "Deepfryer": "deep_fryer",
    "SuitFabricator": "exosuit_forge",
    "ClothingFabricator": "textile_loom",
    "ClothingAlterationStation": "clothing_refashionator",
    "MassiveHeatSink": "anti_entropy_thermo_nullifier",
    "Generator": "coal_generator",
    "MethaneGenerator": "natural_gas_generator",
    "WoodGasGenerator": "wood_burner",
    "Polymerizer": "polymer_press",
    "MineralDeoxidizer": "oxygen_diffuser",
    "FertilizerMaker": "fertilizer_synthesizer",
    "FlushToilet": "lavatory",
    "WashSink": "sink",
    "AdvancedResearchCenter": "super_computer",
    "DLC1CosmicResearchCenter": "virtual_planetarium",
    "HighEnergyParticle": "radbolts",
    "PowerControlStation": "power_control_station",
    "OrbitalResearchDatabank": "data_bank",
    "Mercury": "mercury",
    "SolidMercury": "solid_mercury",
    "DehydratedFoodPackage": "dried_frost_burger",
    "DehydratedSalsa": "dried_stuffed_berry",
    "DehydratedSpiceBread": "dried_pepper_bread",
    "Salsa": "stuffed_berry",
    "SpiceBread": "pepper_bread",
    "BasicPlantBar": "liceloaf",
    "FruitCake": "berry_sludge",
    "Burger": "frost_burger",
    "Quiche": "mushroom_quiche",
    "Curry": "curried_beans",
    "BasicFabric": "reed_fiber",
    "FeatherFabric": "feather_fiber",
    "LubricationStick": "gear_balm",
    "TallowLubricationStick": "tallow_gear_balm",
    "DisposableElectrobank_RawMetal": "metal_power_bank",
    "DisposableElectrobank_UraniumOre": "uranium_ore_power_bank",
    "Electrobank": "eco_power_bank",
    "EmptyElectrobank": "empty_eco_power_bank",
    "SelfChargingElectrobank": "atomic_power_bank",
    "GarbageElectrobank": "power_bank_scrap",
}

# Friendly names for native game tags and well-known multi-material groups
TAG_METADATA = {
    "filter": ("Filtration Medium", "Sand.png"),
    "refined_metal": ("Refined Metal", "Copper.png"),
    "refined_metal_common": ("Common Refined Metal", "Copper.png"),
    "metal_ore": ("Metal Ore", "CopperOre.png"),
    "metal_ore_electrobank": ("Raw Metal Ore", "CopperOre.png"),
    "crushable_mineral": ("Crushable Mineral", "Sandstone.png"),
    "building_wood": ("Wood", "Wood.png"),
    "kiln_fuel": ("Combustible Fuel", "Coal.png"),
    "smoker_fuel": ("Smoker Fuel", "Wood.png"),
    "combustible_liquid": ("Combustible Liquid", "Petroleum.png"),
    "plastifiable_liquid": ("Plastic Source Liquid", "Petroleum.png"),
    "compostable": ("Compostable", "PollutedDirt.png"),
    "edible": ("Any Edible Food", "Barbeque.png"),
    "dehydrated_food": ("Dehydrated Food", "DriedFrostBurger.png"),
    "fiber": ("Textile Fiber", "ReedFiber.png"),
    "grain": ("Grain", "SleetWheatGrain.png"),
    "water_or_mucus": ("Water / Mucus", "Water.png"),
    "seafood": ("Raw Seafood", "PacuFillet.png"),
    "fish_meat": ("Fish Fillet", "PacuFillet.png"),
    "transparent_material": ("Transparent / Gem", "Glass.png"),
    "rocket_liquid_fuel": ("Petroleum / Biodiesel", "Petroleum.png"),
    "fertilizer_or_peat": ("Fertilizer / Peat", "Fertilizer.png"),
    "charged_power_bank": ("Power Bank", "MetalPowerBank.png"),
    "disposable_power_bank": ("Disposable Power Bank", "MetalPowerBank.png"),
    "lubricating_oil": ("Lubricating Oil", "CrudeOil.png"),
    "solid_lubricant": ("Gear Balm", "GearBalm.png"),
    "critter_walker": ("Walking Critter", "Hatch.png"),
    "critter_hoverer": ("Hovering Critter", "Slickster.png"),
    "saturn_trap_prey": ("Land / Hovering Critter", "Hatch.png"),
    "smoker_veggie": ("Smokable Veggie / Fruit", "Pikeapple.png"),
    "basic_booster": ("Basic Booster", None),
    "advanced_booster": ("Advanced Booster", None),
}

# Well-known exact member sets -> semantic tag ID
FROZENSET_TO_TAG_ID = {
    frozenset(["BasicFabric", "FeatherFabric"]): "fiber",
    frozenset(["ColdWheatSeed", "FernFood"]): "grain",
    frozenset(["Water", "Mucus"]): "water_or_mucus",
    frozenset(["FishMeat", "ShellfishMeat"]): "seafood",
    frozenset(["FishMeat", "PrehistoricPacuFillet"]): "fish_meat",
    frozenset(["Petroleum", "RefinedLipid"]): "rocket_liquid_fuel",
    frozenset(["Fertilizer", "Peat"]): "fertilizer_or_peat",
    frozenset(["WoodLog", "FabricatedWood", "PalmWood"]): "building_wood",
    frozenset(["WoodLog", "FabricatedWood", "PalmWood", "Peat"]): "smoker_fuel",
    frozenset(["WoodLog", "FabricatedWood", "PalmWood", "Carbon", "Peat"]): "kiln_fuel",
    frozenset(["Amber", "Diamond", "Glass", "Pearl"]): "transparent_material",
    frozenset(["GardenFoodPlantFood", "HardSkinBerry", "WormBasicFruit"]): "smoker_veggie",
    frozenset(["Nickel", "Copper", "Cobalt", "Zinc", "Aluminum", "Iron"]): "refined_metal_common",
    frozenset(["ZincOre", "Cuprite", "Cobaltite", "AluminumOre", "NickelOre", "Cinnabar", "IronOre"]): "metal_ore_electrobank",
}


def slugify(text: str) -> str:
    s = text.strip().lower()
    s = s.replace("'", "").replace("\u2019", "")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_") or "unknown"


def round_num(v: float) -> float:
    if abs(v) < 1e-12:
        return 0.0
    return float(f"{v:.8g}")


def build_image_index() -> dict[str, str]:
    idx: dict[str, str] = {}
    if IMAGES_DIR.exists():
        for f in IMAGES_DIR.iterdir():
            if f.is_file() and f.suffix.lower() in {".png", ".webp", ".svg", ".jpg"}:
                idx[f.name.lower()] = f.name
    return idx


def find_image(name: str, game_id: str, existing_image: str | None, img_index: dict[str, str]) -> str:
    if existing_image and existing_image.lower() in img_index:
        return img_index[existing_image.lower()]
    clean_alnum = re.sub(r"[^a-zA-Z0-9]", "", name)
    clean_under = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_")
    candidates = [
        f"{clean_alnum}.png",
        f"{clean_under}.png",
        f"{game_id}.png",
        f"{re.sub(r'[^a-zA-Z0-9]', '', game_id)}.png",
    ]
    for c in candidates:
        if c.lower() in img_index:
            return img_index[c.lower()]
    return f"{clean_alnum or game_id}.png"


def load_legacy_lookup() -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, str]]:
    """Reads existing data/*.json and exporter/id_map.json to preserve stable IDs and images."""
    by_id: dict[str, dict[str, Any]] = {}
    by_name: dict[str, dict[str, Any]] = {}
    saved_map: dict[str, str] = {}

    if ID_MAP_PATH.exists():
        try:
            saved_map = json.loads(ID_MAP_PATH.read_text(encoding="utf-8"))
        except Exception:
            saved_map = {}

    for p in sorted(glob.glob(str(DATA_DIR / "*.json"))):
        fname = os.path.basename(p)
        if fname in {"config.json", "recipes.json", "tags.json", "special.json"} or fname.endswith("1.json"):
            continue
        try:
            items = json.loads(Path(p).read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(items, list):
            continue
        for it in items:
            if not isinstance(it, dict) or "id" not in it:
                continue
            by_id[it["id"]] = it
            if it.get("gameId"):
                saved_map.setdefault(it["gameId"], it["id"])
            nm = (it.get("name") or "").strip().lower()
            if nm and nm not in by_name:
                by_name[nm] = it

    return by_id, by_name, saved_map


def main() -> None:
    if not RAW_PATH.exists():
        raise FileNotFoundError(f"Raw export not found: {RAW_PATH}")

    raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")) if OVERRIDES_PATH.exists() else {}
    img_index = build_image_index()
    legacy_by_id, legacy_by_name, saved_map = load_legacy_lookup()

    # Map gameId -> siteId uniquely
    game_to_site: dict[str, str] = {}
    used_site_ids: set[str] = {"heat", "cool", "emit"}

    def assign_id(game_id: str, name: str, category_hint: str = "") -> str:
        if game_id in game_to_site:
            return game_to_site[game_id]

        preferred = None
        if game_id in KNOWN_GAME_TO_SITE_ID:
            preferred = KNOWN_GAME_TO_SITE_ID[game_id]
        elif game_id in saved_map:
            preferred = saved_map[game_id]
        else:
            legacy = legacy_by_name.get(name.strip().lower())
            if legacy:
                preferred = legacy["id"]

        if not preferred:
            preferred = slugify(name if name and not name.startswith("MISSING.") else game_id)

        candidate = preferred
        if candidate in used_site_ids:
            if category_hint:
                alt = f"{candidate}_{category_hint}"
                candidate = alt if alt not in used_site_ids else f"{candidate}_{slugify(game_id)}"
            else:
                candidate = f"{candidate}_{slugify(game_id)}"
        i = 2
        base = candidate
        while candidate in used_site_ids:
            candidate = f"{base}_{i}"
            i += 1

        used_site_ids.add(candidate)
        game_to_site[game_id] = candidate
        return candidate

    # Entity buckets keyed by category
    buckets: dict[str, list[dict[str, Any]]] = {
        "duplicant": [],
        "critter": [],
        "building": [],
        "food": [],
        "plant": [],
        "seed": [],
        "egg": [],
        "geyser": [],
        "gas": [],
        "liquid": [],
        "solid": [],
        "artifact": [],
        "other": [],
    }
    site_items: dict[str, dict[str, Any]] = {}
    game_items: dict[str, dict[str, Any]] = {}
    item_categories: dict[str, str] = {}
    item_tags: dict[str, set[str]] = defaultdict(set)

    used_images: set[str] = set()

    def add_entity(category: str, game_id: str, name: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        sid = assign_id(game_id, name, category)
        is_artifact = game_id.startswith("artifact_")
        legacy = None if is_artifact else (legacy_by_id.get(sid) or legacy_by_name.get(name.strip().lower()))
        legacy_img = legacy.get("image") if legacy else None
        if legacy_img and legacy_img.lower() in used_images:
            legacy_img = None
        img = find_image(name, game_id, legacy_img, img_index)
        if img.lower() in used_images:
            img = f"{re.sub(r'[^a-zA-Z0-9]', '', game_id)}.png"
        used_images.add(img.lower())
        obj: dict[str, Any] = {
            "id": sid,
            "gameId": game_id,
            "name": name,
            "image": img,
        }
        if extra:
            for k, v in extra.items():
                if v is not None and v != "" and v != []:
                    obj[k] = v
        buckets[category].append(obj)
        site_items[sid] = obj
        game_items[game_id] = obj
        item_categories[sid] = category
        return obj

    # Pre-index elements/foods/seeds/critters/plants by gameId
    raw_elements_by_id = {e["id"]: e for e in raw.get("elements", [])}
    raw_foods_by_id = {f["id"]: f for f in raw.get("foods", [])}
    raw_seeds_by_id = {s["id"]: s for s in raw.get("seeds", [])}
    raw_critters_by_id = {c["id"]: c for c in raw.get("critters", [])}
    raw_plants_by_id = {p["id"]: p for p in raw.get("plants", [])}

    # --- 1. Elements (solids, liquids, gases) ---
    for el in raw.get("elements", []):
        if el.get("isDisabled"):
            continue
        state = el.get("state")
        if state == "Solid":
            cat = "solid"
        elif state == "Liquid":
            cat = "liquid"
        elif state == "Gas":
            cat = "gas"
        else:
            continue

        extra: dict[str, Any] = {}
        if el.get("description"):
            extra["description"] = el["description"]
        if el.get("materialCategory"):
            extra["category"] = el["materialCategory"]
        if el.get("lowTempC") is not None and el.get("lowTempTransitionTarget"):
            extra["freezing_point"] = el["lowTempC"]
            extra["freezing_product"] = el["lowTempTransitionTarget"]
        if el.get("highTempC") is not None and el.get("highTempTransitionTarget"):
            if state == "Solid":
                extra["melting_point"] = el["highTempC"]
                extra["melting_product"] = el["highTempTransitionTarget"]
            elif state == "Liquid":
                extra["boiling_point"] = el["highTempC"]
                extra["boiling_product"] = el["highTempTransitionTarget"]

        el_name = el["name"]
        if el["id"] == "SolidMercury" and el_name == "Mercury":
            el_name = "Solid Mercury"

        obj = add_entity(cat, el["id"], el_name, extra)
        if el["id"] == "SolidMercury" and "solidmercury.png" in img_index:
            obj["image"] = img_index["solidmercury.png"]
        elif el["id"] == "SolidResin" and "solidsap.png" in img_index:
            obj["image"] = img_index["solidsap.png"]
        ore_tags = set(el.get("oreTags") or [])
        mat_cat = el.get("materialCategory") or ""
        if mat_cat:
            ore_tags.add(mat_cat)

        # Clean element-level semantic tags
        if state == "Solid":
            if "Filter" in ore_tags:
                item_tags[obj["id"]].add("filter")
            if "RefinedMetal" in ore_tags:
                item_tags[obj["id"]].add("refined_metal")
            if "Metal" in ore_tags:
                item_tags[obj["id"]].add("metal_ore")
            if "BuildingWood" in ore_tags:
                item_tags[obj["id"]].add("building_wood")
            if "Compostable" in ore_tags:
                item_tags[obj["id"]].add("compostable")
        elif state == "Liquid":
            if "CombustibleLiquid" in ore_tags:
                item_tags[obj["id"]].add("combustible_liquid")
            if "PlastifiableLiquid" in ore_tags:
                item_tags[obj["id"]].add("plastifiable_liquid")
            if "LubricatingOil" in ore_tags:
                item_tags[obj["id"]].add("lubricating_oil")

    # Resolve element transition product display names
    for cat in ("solid", "liquid", "gas"):
        for obj in buckets[cat]:
            for field in ("freezing_product", "melting_product", "boiling_product"):
                gid = obj.get(field)
                if gid and gid in game_items:
                    obj[field] = game_items[gid]["name"]

    # --- 2. Duplicants ---
    for dup in raw.get("duplicants", []):
        add_entity(
            "duplicant",
            dup["id"],
            dup["name"],
            {"dlc": dup.get("requiredDlcIds")},
        )

    # --- 3. Foods ---
    for fd in raw.get("foods", []):
        extra = {
            "description": fd.get("description"),
            "quality": fd.get("quality"),
            "dlc": fd.get("requiredDlcIds"),
        }
        if fd.get("kcalPerKg", 0) > 0:
            extra["kcalPerKg"] = round_num(fd["kcalPerKg"])
        obj = add_entity("food", fd["id"], fd["name"], extra)
        if "Edible" in (fd.get("tags") or []) and fd.get("kcalPerKg", 0) > 0:
            item_tags[obj["id"]].add("edible")

    # --- 4. Buildings ---
    cr_fabricators: set[str] = set()
    for cr in raw.get("complexRecipesPreProcess", []):
        for fab in cr.get("fabricators") or []:
            cr_fabricators.add(fab)

    for b in raw.get("buildings", []):
        name = b.get("name") or ""
        if name.startswith("MISSING."):
            continue
        is_deprecated = bool(b.get("deprecated"))
        has_proc = any(
            b.get(k)
            for k in (
                "elementConverters",
                "energyGenerator",
                "tinkerStation",
                "flushToilet",
                "outhouse",
                "handSanitizer",
                "researchCenter",
                "oilWellCap",
                "rocketEngine",
                "nuclearReactor",
                "rehydrator",
                "perUseRecipes",
            )
        ) or (b["id"] in cr_fabricators)

        if is_deprecated:
            continue
        if not b.get("showInBuildMenu") and not has_proc:
            continue

        extra = {
            "description": b.get("effect") or b.get("description"),
            "power_consumption": round_num(b["powerConsumption"]) if b.get("powerConsumption") else None,
            "power_generation": round_num(b["powerGeneration"]) if b.get("powerGeneration") else None,
            "dlc": b.get("requiredDlcIds"),
        }
        add_entity("building", b["id"], name, extra)

    # --- 5. Critters (adults; babies only if needed by egg/diet references, marked clean) ---
    for c in raw.get("critters", []):
        if c.get("isBaby"):
            continue
        name = c.get("name") or ""
        if name.startswith("MISSING."):
            continue
        ctags = set(c.get("tags") or [])
        # Robots (Sweepy, Biobot, Rover, Flydo) belong in "other", not "critter"
        is_robot = "Robot" in ctags
        extra = {
            "description": c.get("description"),
            "species": None if is_robot else c.get("species"),
            "dlc": c.get("requiredDlcIds"),
        }
        obj = add_entity("other" if is_robot else "critter", c["id"], name, extra)
        is_trappable_critter = (not is_robot) and ("BagableCreature" in ctags) and ("LargeCreature" not in ctags)
        if "Walker" in ctags and not is_robot:
            item_tags[obj["id"]].add("critter_walker")
        if "Hoverer" in ctags and not is_robot:
            item_tags[obj["id"]].add("critter_hoverer")
        if is_trappable_critter and ("Walker" in ctags or "Hoverer" in ctags):
            item_tags[obj["id"]].add("saturn_trap_prey")

    # --- 6. Eggs ---
    for egg in raw.get("eggs", []):
        name = egg.get("name") or ""
        if name.startswith("MISSING."):
            continue
        extra = {
            "description": egg.get("description"),
            "mass": round_num(egg["massKg"] * 1000.0) if egg.get("massKg") else None,
            "dlc": egg.get("requiredDlcIds"),
        }
        obj = add_entity("egg", egg["id"], name, extra)
        # Fallback image matching via baby critter name (e.g. Drecklet -> DreckletEgg.png)
        if obj["image"].lower() not in img_index and egg.get("spawnedCreature"):
            baby = raw_critters_by_id.get(egg["spawnedCreature"])
            if baby and baby.get("name"):
                b_egg = find_image(f"{baby['name']} Egg", egg["id"], None, img_index)
                if b_egg.lower() in img_index:
                    obj["image"] = b_egg

    # --- 7. Plants ---
    # Skip internal branch prefabs when parent tree exists (merge SeaTreeBranch crop into SeaTree)
    branch_prefabs = {
        p["branchGrower"]["branchPrefabName"]
        for p in raw.get("plants", [])
        if p.get("branchGrower") and p["branchGrower"].get("branchPrefabName")
    }
    branch_prefabs.add("SeaTreeBranch")
    sea_tree_branch = raw_plants_by_id.get("SeaTreeBranch")

    for p in raw.get("plants", []):
        name = p.get("name") or ""
        if name.startswith("MISSING.") or p["id"] in branch_prefabs:
            continue
        if p["id"] == "SeaTree" and not p.get("crop") and sea_tree_branch and sea_tree_branch.get("crop"):
            p["crop"] = sea_tree_branch["crop"]
            if sea_tree_branch.get("seedProducer"):
                p["seedProducer"] = sea_tree_branch["seedProducer"]
        extra = {
            "description": p.get("description"),
            "dlc": p.get("requiredDlcIds"),
        }
        add_entity("plant", p["id"], name, extra)

    # --- 8. Seeds ---
    # Skip seeds already added as Foods (e.g., ColdWheatSeed / BeanPlantSeed / ButterflyPlantSeed)
    for s in raw.get("seeds", []):
        if s["id"] in game_items:
            continue
        name = s.get("name") or ""
        if name.startswith("MISSING."):
            continue
        extra = {
            "description": s.get("description"),
            "dlc": s.get("requiredDlcIds"),
        }
        obj = add_entity("seed", s["id"], name, extra)
        # Fallback image matching via plant name (e.g. Alveo Vera -> AlveoVeraSeed.png)
        if obj["image"].lower() not in img_index and s.get("plantId"):
            pl = raw_plants_by_id.get(s["plantId"])
            if pl and pl.get("name"):
                p_seed = find_image(f"{pl['name']} Seed", s["id"], None, img_index)
                if p_seed.lower() in img_index:
                    obj["image"] = p_seed

    # --- 9. Geysers ---
    # Deduplicate legacy geyser prefabs (e.g. MethaneGeyser, NiobiumGeyser, ChlorineGeyser, Geyser)
    # whenever a canonical GeyserGeneric_* prefab exists for the same geyserTypeId.
    generic_geyser_types = {
        g["geyserTypeId"]
        for g in raw.get("geysers", [])
        if g["id"].startswith("GeyserGeneric_")
    }
    for g in raw.get("geysers", []):
        name = g.get("name") or ""
        if name.startswith("MISSING."):
            continue
        if not g["id"].startswith("GeyserGeneric_") and g.get("geyserTypeId") in generic_geyser_types:
            continue
        avg_g_s = ((g["minRatePerCycleKg"] + g["maxRatePerCycleKg"]) / 2.0 / 600.0) * ((g["minYearPercent"] + g["maxYearPercent"]) / 2.0) * 1000.0
        min_g_s = (g["minRatePerCycleKg"] / 600.0) * g["minYearPercent"] * 1000.0
        max_g_s = (g["maxRatePerCycleKg"] / 600.0) * g["maxYearPercent"] * 1000.0
        extra = {
            "description": g.get("description"),
            "emission_temp": round_num(g["temperatureC"]) if g.get("temperatureC") is not None else None,
            "max_pressure": round_num(g["maxPressureKg"]) if g.get("maxPressureKg") is not None else None,
            "avg_output_g_s": round_num(avg_g_s) if avg_g_s > 0 else None,
            "min_output_g_s": round_num(min_g_s) if min_g_s > 0 else None,
            "max_output_g_s": round_num(max_g_s) if max_g_s > 0 else None,
            "dlc": g.get("requiredDlcIds"),
        }
        add_entity("geyser", g["id"], name, extra)

    # --- 10. Other Items (skip Compost* internal wrappers & legacy/unused duplicates) ---
    # Also ensure Radbolts exists for HEP recipes
    add_entity("other", "HighEnergyParticle", "Radbolts", {"description": "High-energy particles used by radbolt buildings and engines."})
    if "radbolt.png" in img_index:
        game_items["HighEnergyParticle"]["image"] = img_index["radbolt.png"]

    # Extra manual items from overrides.json (e.g. Spices)
    for ei in overrides.get("extraItems", []):
        cat = ei.get("category", "other")
        gid = ei["gameId"]
        if gid in game_items:
            continue
        if ei.get("id"):
            saved_map.setdefault(gid, ei["id"])
        obj = add_entity(cat, gid, ei["name"], {
            "description": ei.get("description"),
            "dlc": ei.get("dlc"),
        })
        if ei.get("image") and ei["image"].lower() in img_index:
            obj["image"] = img_index[ei["image"].lower()]

    skip_item_ids = {"ResearchDatabank", "GasGrassHarvested", "ShockWorm"}
    for it in raw.get("items", []):
        gid = it["id"]
        if gid in game_items or gid in skip_item_ids or gid.startswith("Compost"):
            continue
        name = it.get("name") or ""
        if not name or name.startswith("MISSING."):
            continue
        if gid == "artifact_rainboweggrock" and name == "Egg-Shaped Rock":
            name = "Egg-Shaped Rock (Iridescent)"
        elif gid == "artifact_sink" and name == "Sink":
            name = "Sink (Artifact)"
        elif gid == "artifact_sandstone" and name == "Sandstone":
            name = "Sandstone (Artifact)"
        itags = set(it.get("tags") or [])
        is_artifact = ("Artifact" in itags) or ("Keepsake" in itags)
        extra = {
            "description": it.get("description"),
            "dlc": it.get("requiredDlcIds"),
        }
        obj = add_entity("artifact" if is_artifact else "other", gid, name, extra)
        if "Dehydrated" in itags:
            item_tags[obj["id"]].add("dehydrated_food")
        if "ChargedPortableBattery" in itags:
            item_tags[obj["id"]].add("charged_power_bank")
        if "DisposablePortableBattery" in itags:
            item_tags[obj["id"]].add("disposable_power_bank")
        if "SolidLubricant" in itags:
            item_tags[obj["id"]].add("solid_lubricant")
        if "Compostable" in itags:
            item_tags[obj["id"]].add("compostable")

    # Helper to determine whether a gameId is measured in mass (g) or units (unit) in ComplexRecipes
    def is_mass_entity(game_id: str) -> bool:
        if game_id in raw_elements_by_id:
            return True
        if game_id in raw_foods_by_id:
            return True
        # Every ONI plant seed has PrimaryElement.Mass = 1 kg (1000 g)
        if game_id in raw_seeds_by_id:
            return True
        # Note: in ONI ComplexRecipes, RawEgg/Meat/PlantFiber/WoodLog/etc.
        if game_id in {
            "RawEgg", "EggShell", "PlantFiber", "Kelp", "MilkFat", "Tallow",
            "Fossil", "Lime", "TableSalt", "RotPile", "Amber",
            "IceBellyPoop", "CrabShell", "CrabWoodShell", "SnailShell", "SnailIronShell",
        }:
            return True
        return False

    # Dynamic tag registry for recipe groups
    tags_registry: dict[str, dict[str, Any]] = {}

    def ensure_tag(tag_id: str, name: str | None = None, members_site_ids: list[str] | None = None, image: str | None = None) -> str:
        if tag_id not in tags_registry:
            meta_name, meta_img = TAG_METADATA.get(tag_id, (name or tag_id.replace("_", " ").title(), image))
            resolved_img = meta_img
            if resolved_img and resolved_img.lower() in img_index:
                resolved_img = img_index[resolved_img.lower()]
            elif members_site_ids:
                first = site_items.get(members_site_ids[0])
                resolved_img = first["image"] if first else ""
            tags_registry[tag_id] = {
                "id": tag_id,
                "name": name or meta_name,
                "image": resolved_img or "",
            }
        if members_site_ids:
            for sid in members_site_ids:
                if sid in site_items:
                    item_tags[sid].add(tag_id)
        return tag_id

    # Map known game Tag strings -> our clean site tag IDs
    GAME_TAG_TO_SITE_TAG = {
        "Filter": "filter",
        "RefinedMetal": "refined_metal",
        "Metal": "metal_ore",
        "BuildingWood": "building_wood",
        "CombustibleLiquid": "combustible_liquid",
        "PlastifiableLiquid": "plastifiable_liquid",
        "Compostable": "compostable",
        "Edible": "edible",
        "Dehydrated": "dehydrated_food",
        "ChargedPortableBattery": "charged_power_bank",
        "DisposablePortableBattery": "disposable_power_bank",
        "LubricatingOil": "lubricating_oil",
        "SolidLubricant": "solid_lubricant",
        "Walker": "critter_walker",
        "Hoverer": "critter_hoverer",
    }

    # Pre-register tags that already have item members
    for tid in list(GAME_TAG_TO_SITE_TAG.values()) + ["saturn_trap_prey"]:
        members = sorted(sid for sid, tset in item_tags.items() if tid in tset)
        if members:
            ensure_tag(tid, members_site_ids=members)

    # Helper: convert a set of gameIds into a clean reusable tag
    dynamic_set_to_tag: dict[frozenset[str], str] = {}
    for fs, tid in FROZENSET_TO_TAG_ID.items():
        # Filter to gameIds that actually exist in our dataset
        valid_sids = sorted(game_to_site[g] for g in fs if g in game_to_site)
        if len(valid_sids) >= 2:
            ensure_tag(tid, members_site_ids=valid_sids)
            dynamic_set_to_tag[frozenset(valid_sids)] = tid

    def get_or_create_group_tag(game_ids: list[str], suggested_id: str, suggested_name: str) -> str | None:
        sids = sorted({game_to_site[g] for g in game_ids if g in game_to_site})
        if len(sids) == 0:
            return None
        if len(sids) == 1:
            return None  # Caller should emit concrete element instead
        fs_game = frozenset(g for g in game_ids if g in game_to_site)
        if fs_game in FROZENSET_TO_TAG_ID:
            tid = FROZENSET_TO_TAG_ID[fs_game]
            ensure_tag(tid, members_site_ids=sids)
            return tid
        fs_site = frozenset(sids)
        # Check if this exact set matches an already existing tag
        for existing_tid in list(tags_registry.keys()):
            existing_members = frozenset(sid for sid, tset in item_tags.items() if existing_tid in tset)
            if existing_members == fs_site:
                return existing_tid
        if fs_site in dynamic_set_to_tag:
            return dynamic_set_to_tag[fs_site]

        tid = slugify(suggested_id)
        base = tid
        idx = 2
        while tid in tags_registry:
            tid = f"{base}_{idx}"
            idx += 1
        ensure_tag(tid, name=suggested_name, members_site_ids=sids)
        dynamic_set_to_tag[fs_site] = tid
        return tid

    def resolve_ref(game_tag_or_id: str) -> tuple[str, str] | None:
        """Returns ('element', site_id) or ('tag', tag_id) or None."""
        if game_tag_or_id in game_to_site:
            return ("element", game_to_site[game_tag_or_id])
        if game_tag_or_id in GAME_TAG_TO_SITE_TAG:
            tid = GAME_TAG_TO_SITE_TAG[game_tag_or_id]
            members = [sid for sid, tset in item_tags.items() if tid in tset]
            if members:
                ensure_tag(tid, members_site_ids=members)
                return ("tag", tid)
        return None

    def make_entry(ref_kind: str, ref_id: str, amount: float, unit: str, per: str | None = None, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        entry: dict[str, Any] = {ref_kind: ref_id, "amount": round_num(amount), "unit": unit}
        if per:
            entry["per"] = per
        if extra:
            entry.update(extra)
        return entry

    # =========================================================================
    # RECIPE GENERATION
    # =========================================================================
    recipes: list[dict[str, Any]] = []
    seen_recipe_sigs: set[str] = set()

    def add_recipe(r: dict[str, Any]) -> None:
        # Validate every ref exists
        src = r.get("source")
        if src not in {"heat", "cool", "emit"} and src not in site_items:
            return
        consumed = r.get("consumed") or []
        produced = r.get("produced") or []
        if not consumed and not produced:
            return
        for side in (consumed, produced):
            for it in side:
                if "element" in it and it["element"] not in site_items:
                    return
                if "tag" in it and it["tag"] not in tags_registry:
                    return
        sig = json.dumps(r, sort_keys=True, ensure_ascii=False)
        if sig in seen_recipe_sigs:
            return
        seen_recipe_sigs.add(sig)
        recipes.append(r)

    # --- A. Element Phase Transitions & Sublimation ---
    for el in raw.get("elements", []):
        if el.get("isDisabled") or el["id"] not in game_to_site:
            continue
        sid = game_to_site[el["id"]]

        # High temp (heat)
        ht_target = el.get("highTempTransitionTarget")
        if ht_target and ht_target in game_to_site and el.get("highTempC") is not None:
            ore_id = el.get("highTempTransitionOreId")
            ore_conv = el.get("highTempTransitionOreMassConversion") or 0.0
            prod = []
            if ore_id and ore_id in game_to_site and ore_conv > 0:
                prod.append(make_entry("element", game_to_site[ht_target], (1.0 - ore_conv) * 1000.0, "g"))
                prod.append(make_entry("element", game_to_site[ore_id], ore_conv * 1000.0, "g"))
            else:
                prod.append(make_entry("element", game_to_site[ht_target], 1000.0, "g"))
            add_recipe({
                "source": "heat",
                "temp": el["highTempC"],
                "consumed": [make_entry("element", sid, 1000.0, "g")],
                "produced": prod,
            })

        # Low temp (cool)
        lt_target = el.get("lowTempTransitionTarget")
        if lt_target and lt_target in game_to_site and el.get("lowTempC") is not None:
            ore_id = el.get("lowTempTransitionOreId")
            ore_conv = el.get("lowTempTransitionOreMassConversion") or 0.0
            prod = []
            if ore_id and ore_id in game_to_site and ore_conv > 0:
                prod.append(make_entry("element", game_to_site[lt_target], (1.0 - ore_conv) * 1000.0, "g"))
                prod.append(make_entry("element", game_to_site[ore_id], ore_conv * 1000.0, "g"))
            else:
                prod.append(make_entry("element", game_to_site[lt_target], 1000.0, "g"))
            add_recipe({
                "source": "cool",
                "temp": el["lowTempC"],
                "consumed": [make_entry("element", sid, 1000.0, "g")],
                "produced": prod,
            })

        # Sublimation / Off-gassing (emit)
        psub = el.get("prefabSublimates")
        if psub and psub.get("element") in game_to_site and psub.get("element") != el["id"]:
            out_sid = game_to_site[psub["element"]]
            rate = psub.get("sublimationRate") or 0.0
            if rate > 0:
                if psub.get("massPower") == 1.0:
                    add_recipe({
                        "source": "emit",
                        "consumed": [make_entry("element", sid, rate * 100.0, "% mass", "s")],
                        "produced": [make_entry("element", out_sid, rate * 100.0, "% mass", "s")],
                    })
                else:
                    add_recipe({
                        "source": "emit",
                        "consumed": [make_entry("element", sid, rate * 1000.0, "g", "s")],
                        "produced": [make_entry("element", out_sid, rate * 1000.0, "g", "s")],
                    })

    # --- B. Complex Recipes (Fabricators — using preProcessRecipes to preserve tag groups!) ---
    # Fabricators whose ElementConverter runs ONLY while actively executing a timed recipe
    # (fold fuel/exhaust directly into each operation: kgPerSec * timeSec).
    FOLD_CONVERTER_FABRICATORS = {"FoodDehydrator", "GourmetCookingStation", "Smoker"}
    raw_buildings_by_id = {b["id"]: b for b in raw.get("buildings", [])}

    def snap_clean_grams(val_g: float) -> float:
        nearest = round(val_g)
        if abs(val_g - nearest) < 0.01:
            return float(nearest)
        return round_num(val_g)

    dehydrated_to_food: dict[str, str] = {}

    for cr in raw.get("complexRecipesPreProcess", []):
        fabs = [f for f in (cr.get("fabricators") or []) if f in game_to_site]
        if not fabs:
            continue

        # Track FoodDehydrator pairs for FoodRehydrator later
        if "FoodDehydrator" in fabs and cr.get("ingredients") and cr.get("results"):
            in_food = next((x.get("material") for x in cr["ingredients"] if x.get("material") in raw_foods_by_id), None)
            out_dehyd = next((x.get("material") for x in cr["results"] if x.get("material") and x["material"].startswith("Dehydrated")), None)
            if in_food and out_dehyd:
                dehydrated_to_food[out_dehyd] = in_food

        # For each ingredient, split by distinct amount if possibleMaterialAmounts varies (only 4 recipes in game)
        # Build list of ingredient-variant choices (Cartesian across the <=1 split ingredient)
        ing_variants_list: list[list[dict[str, Any]]] = [[]]

        valid_recipe = True
        for ing in cr.get("ingredients") or []:
            # FoodDehydrator marks its input food with doNotConsume=True internally only because
            # the entity is packed inside DehydratedFoodPackage instead of destroyed; it IS consumed as input.
            if ing.get("doNotConsume") and "FoodDehydrator" not in fabs:
                continue
            pm = [m for m in (ing.get("possibleMaterials") or []) if m in game_to_site]
            pma = ing.get("possibleMaterialAmounts") or []

            if len(pm) == 0:
                mat = ing.get("material")
                if mat and mat in game_to_site:
                    pm = [mat]
                elif mat and mat in GAME_TAG_TO_SITE_TAG:
                    ref = resolve_ref(mat)
                    if not ref:
                        valid_recipe = False
                        break
                    amt = ing.get("amount") or 0.0
                    entry = make_entry(ref[0], ref[1], amt * 1000.0, "g")
                    ing_variants_list = [v + [entry] for v in ing_variants_list]
                    continue
                else:
                    valid_recipe = False
                    break

            # Group pm by (amount, is_mass_entity) so unit items and mass items never share one tag
            by_amt_kind: dict[tuple[float, bool], list[str]] = defaultdict(list)
            raw_pm = ing.get("possibleMaterials") or []
            if pma and len(pma) == len(raw_pm):
                for m, a in zip(raw_pm, pma):
                    if m in game_to_site:
                        by_amt_kind[(round_num(a), is_mass_entity(m))].append(m)
            else:
                amt = round_num(ing.get("amount") or 0.0)
                for m in pm:
                    by_amt_kind[(amt, is_mass_entity(m))].append(m)

            options_entries: list[dict[str, Any]] = []
            for (amt, grp_is_mass), mats in by_amt_kind.items():
                if amt <= 0:
                    continue
                unit = "g" if grp_is_mass else "unit"
                val = amt * 1000.0 if unit == "g" else amt
                if len(mats) == 1:
                    m = mats[0]
                    options_entries.append(make_entry("element", game_to_site[m], val, unit))
                else:
                    # Determine tag for this group
                    first_fab = fabs[0]
                    first_res = (cr.get("results") or [{}])[0].get("material") or "item"
                    if first_fab == "EggCracker":
                        # Check species name from first egg
                        sugg_id = f"egg_{slugify(mats[0].replace('Egg', ''))}_group"
                        base_egg_name = game_items[mats[0]]["name"]
                        sugg_name = f"{base_egg_name} Variants"
                    elif first_fab == "RockCrusher" and len(mats) >= 8:
                        sugg_id = "crushable_mineral"
                        sugg_name = "Crushable Mineral"
                    elif first_fab == "MicrobeMusher" and first_res == "FishFood":
                        sugg_id = "pacu_treat_seed"
                        sugg_name = "Pacu Treat Seed"
                    else:
                        sugg_id = f"{slugify(first_fab)}_{slugify(first_res)}_input"
                        sugg_name = " / ".join(game_items[m]["name"] for m in mats[:2]) + (f" (+{len(mats)-2})" if len(mats) > 2 else "")

                    tid = get_or_create_group_tag(mats, sugg_id, sugg_name)
                    if tid:
                        options_entries.append(make_entry("tag", tid, val, unit))
                    else:
                        options_entries.append(make_entry("element", game_to_site[mats[0]], val, unit))

            if not options_entries:
                valid_recipe = False
                break

            new_list = []
            for prev in ing_variants_list:
                for opt in options_entries:
                    new_list.append(prev + [opt])
            ing_variants_list = new_list

        if not valid_recipe:
            continue

        # Results
        prod_entries: list[dict[str, Any]] = []
        for res in cr.get("results") or []:
            mat = res.get("material")
            if not mat or mat not in game_to_site:
                valid_recipe = False
                break
            amt = res.get("amount") or 0.0
            if amt <= 0:
                continue
            unit = "g" if is_mass_entity(mat) else "unit"
            val = amt * 1000.0 if unit == "g" else amt
            prod_entries.append(make_entry("element", game_to_site[mat], val, unit))

        if not valid_recipe:
            continue

        # Radbolts (HEP)
        hep_in = cr.get("consumedHep") or 0
        hep_out = cr.get("producedHep") or 0
        if hep_in > 0 and "HighEnergyParticle" in game_to_site:
            ing_variants_list = [v + [make_entry("element", game_to_site["HighEnergyParticle"], hep_in, "unit")] for v in ing_variants_list]
        if hep_out > 0 and "HighEnergyParticle" in game_to_site:
            prod_entries.append(make_entry("element", game_to_site["HighEnergyParticle"], hep_out, "unit"))

        time_sec = cr.get("timeSec") or 0.0
        for fab in fabs:
            src_id = game_to_site[fab]
            extra_cons: list[dict[str, Any]] = []
            extra_prod: list[dict[str, Any]] = []
            if fab in FOLD_CONVERTER_FABRICATORS and time_sec > 0:
                b_obj = raw_buildings_by_id.get(fab)
                for ec in (b_obj.get("elementConverters") or []) if b_obj else []:
                    for c in ec.get("consumed") or []:
                        ref = resolve_ref(c["tag"])
                        if ref and c.get("kgPerSec", 0) > 0:
                            extra_cons.append(make_entry(ref[0], ref[1], snap_clean_grams(c["kgPerSec"] * time_sec * 1000.0), "g"))
                    for o in ec.get("produced") or []:
                        ref = resolve_ref(o["element"])
                        if ref and o.get("kgPerSec", 0) > 0:
                            extra_prod.append(make_entry(ref[0], ref[1], snap_clean_grams(o["kgPerSec"] * time_sec * 1000.0), "g"))

            for cons_entries in ing_variants_list:
                if fab == "FoodDehydrator":
                    cons_per = [{**e, "per": "use"} for e in (cons_entries + extra_cons)]
                    prod_per = [{**e, "per": "use"} for e in (prod_entries + extra_prod)]
                    rec: dict[str, Any] = {
                        "source": src_id,
                        "consumed": cons_per,
                        "produced": prod_per,
                    }
                else:
                    rec = {
                        "source": src_id,
                        "consumed": cons_entries + extra_cons,
                        "produced": prod_entries + extra_prod,
                    }
                if time_sec > 0:
                    rec["time"] = round_num(time_sec)
                add_recipe(rec)

    # Collapse EggCracker species groups that have IDENTICAL output (e.g. all 2kg standard eggs -> 1kg Raw Egg + 1kg Egg Shell)
    egg_cracker_sid = game_to_site.get("EggCracker")
    if egg_cracker_sid:
        ec_recipes = [r for r in recipes if r["source"] == egg_cracker_sid]
        other_recipes = [r for r in recipes if r["source"] != egg_cracker_sid]
        by_prod_sig: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in ec_recipes:
            psig = json.dumps(r["produced"], sort_keys=True)
            by_prod_sig[psig].append(r)

        merged_ec: list[dict[str, Any]] = []
        for psig, group in by_prod_sig.items():
            if len(group) == 1:
                merged_ec.append(group[0])
                continue
            # Gather all concrete egg site_ids across these recipes
            egg_sids: list[str] = []
            for r in group:
                c0 = r["consumed"][0]
                if "element" in c0:
                    egg_sids.append(c0["element"])
                elif "tag" in c0:
                    t = c0["tag"]
                    egg_sids.extend(sid for sid, tset in item_tags.items() if t in tset)
                    # Remove intermediate species-only egg tag if unused elsewhere
                    if t.startswith("egg_") and t.endswith("_group"):
                        for sid in list(item_tags.keys()):
                            item_tags[sid].discard(t)
                        tags_registry.pop(t, None)
            egg_sids = sorted(set(egg_sids))
            # Name tag nicely based on output mass
            raw_egg_amt = next((p["amount"] for p in group[0]["produced"] if p.get("element") == game_to_site.get("RawEgg")), 0)
            egg_mass_kg = round_num((raw_egg_amt * 2.0) / 1000.0) if raw_egg_amt else 0
            has_shell = any(p.get("element") == game_to_site.get("EggShell") for p in group[0]["produced"])
            if egg_mass_kg and has_shell and len(group[0]["produced"]) == 2:
                mass_slug = f"{egg_mass_kg:g}".replace(".", "_")
                tid = f"crackable_egg_{mass_slug}kg"
                tname = f"{egg_mass_kg:g} kg Egg"
            else:
                tid = f"crackable_egg_group_{len(merged_ec)+1}"
                tname = "Crackable Egg"
            ensure_tag(tid, name=tname, members_site_ids=egg_sids)
            merged_ec.append({
                "source": egg_cracker_sid,
                "consumed": [make_entry("tag", tid, 1, "unit")],
                "produced": group[0]["produced"],
                "time": group[0].get("time", 5),
            })
        recipes = other_recipes + merged_ec
        seen_recipe_sigs = {json.dumps(r, sort_keys=True, ensure_ascii=False) for r in recipes}

    # Collapse BionicUpgrade booster recipes that have identical (source, consumed, time) into tags
    bionic_booster_sids = {
        game_to_site[it["id"]]
        for it in raw.get("items", [])
        if it["id"] in game_to_site and "BionicUpgrade" in (it.get("tags") or [])
    }
    if bionic_booster_sids:
        booster_groups: dict[tuple[str, str, Any], list[dict[str, Any]]] = defaultdict(list)
        non_booster_recipes: list[dict[str, Any]] = []
        for r in recipes:
            prod = r.get("produced") or []
            if len(prod) == 1 and prod[0].get("element") in bionic_booster_sids:
                gkey = (r["source"], json.dumps(r.get("consumed") or [], sort_keys=True), r.get("time"))
                booster_groups[gkey].append(r)
            else:
                non_booster_recipes.append(r)

        merged_boosters: list[dict[str, Any]] = []
        microchip_sid = game_to_site.get("PowerStationTools")
        for (src_id, _csig, r_time), group in booster_groups.items():
            if len(group) == 1:
                merged_boosters.append(group[0])
                continue
            member_sids = sorted({r["produced"][0]["element"] for r in group})
            cons = group[0].get("consumed") or []
            mc_amt = next((c["amount"] for c in cons if c.get("element") == microchip_sid), 0)
            if len(cons) == 1 and mc_amt == 2:
                tid, tname = "basic_booster", "Basic Booster"
            elif len(cons) == 1 and mc_amt == 8:
                tid, tname = "advanced_booster", "Advanced Booster"
            else:
                tid = f"booster_{slugify(src_id)}_{int(mc_amt) if mc_amt else len(merged_boosters) + 1}"
                tname = f"Booster ({int(mc_amt)} Microchips)" if mc_amt else "Booster"
            ensure_tag(tid, name=tname, members_site_ids=member_sids)
            first_p = group[0]["produced"][0]
            rec: dict[str, Any] = {
                "source": src_id,
                "consumed": cons,
                "produced": [make_entry("tag", tid, first_p["amount"], first_p["unit"], first_p.get("per"))],
            }
            if r_time is not None:
                rec["time"] = r_time
            merged_boosters.append(rec)

        recipes = non_booster_recipes + merged_boosters
        seen_recipe_sigs = {json.dumps(r, sort_keys=True, ensure_ascii=False) for r in recipes}

    # --- C. Building Converters, Generators, Toilets, Research, Tinker, Reactor, Rehydrator, Recreation ---
    for b in raw.get("buildings", []):
        gid = b["id"]
        if gid not in game_to_site:
            continue
        src_id = game_to_site[gid]

        # Special merge for AlgaeHabitat (2 converters + CO2 consumer -> 1 clean recipe!)
        if gid == "AlgaeHabitat":
            cons = []
            prod = []
            for ec in b.get("elementConverters") or []:
                for c in ec["consumed"]:
                    ref = resolve_ref(c["tag"])
                    if ref:
                        cons.append(make_entry(ref[0], ref[1], c["kgPerSec"] * 1000.0, "g", "s"))
                for o in ec["produced"]:
                    ref = resolve_ref(o["element"])
                    if ref:
                        prod.append(make_entry(ref[0], ref[1], o["kgPerSec"] * 1000.0, "g", "s"))
            for ec_c in b.get("elementConsumers") or []:
                if not ec_c.get("storeOnConsume") and ec_c.get("element"):
                    ref = resolve_ref(ec_c["element"])
                    if ref:
                        cons.append(make_entry(ref[0], ref[1], ec_c["kgPerSec"] * 1000.0, "g", "s"))
            add_recipe({"source": src_id, "consumed": cons, "produced": prod})
            continue

        # ResearchCenter: use researchCenter per research point (avoid duplicating converter)
        if b.get("researchCenter"):
            rc = b["researchCenter"]
            ref = resolve_ref(rc["inputMaterial"]) if rc.get("inputMaterial") else None
            if ref and rc.get("massPerPointKg", 0) > 0:
                is_mass = ref[0] == "tag" or is_mass_entity(rc["inputMaterial"])
                unit = "g" if is_mass else "unit"
                val = rc["massPerPointKg"] * 1000.0 if is_mass else rc["massPerPointKg"]
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry(ref[0], ref[1], val, unit, "research point")],
                    "produced": [],
                })
            continue

        # ElementConverters (skip fabricators whose active fuel/exhaust is folded into each craft recipe)
        if gid not in FOLD_CONVERTER_FABRICATORS:
            for ec in b.get("elementConverters") or []:
                cons = []
                prod = []
                ok = True
                for c in ec["consumed"]:
                    ref = resolve_ref(c["tag"])
                    if not ref:
                        ok = False
                        break
                    if ref[0] == "element" and not is_mass_entity(c["tag"]):
                        # Non-mass items (DreamJournal, OrbitalResearchDatabank) have 1 kg/unit in ElementConverter
                        cons.append(make_entry(ref[0], ref[1], c["kgPerSec"], "unit", "s"))
                    else:
                        cons.append(make_entry(ref[0], ref[1], c["kgPerSec"] * 1000.0, "g", "s"))
                for o in ec["produced"]:
                    ref = resolve_ref(o["element"])
                    if not ref:
                        ok = False
                        break
                    prod.append(make_entry(ref[0], ref[1], o["kgPerSec"] * 1000.0, "g", "s"))
                # OilWellCap also produces Methane gas from OilWellCap component!
                if gid == "OilWellCap" and b.get("oilWellCap"):
                    ow = b["oilWellCap"]
                    gref = resolve_ref(ow["gasElement"])
                    if gref and ow.get("addGasRateKgPerSec", 0) > 0:
                        prod.append(make_entry(gref[0], gref[1], ow["addGasRateKgPerSec"] * 1000.0, "g", "s"))
                if ok and (cons or prod):
                    add_recipe({"source": src_id, "consumed": cons, "produced": prod})

        # EnergyGenerator
        if b.get("energyGenerator"):
            eg = b["energyGenerator"]
            cons = []
            prod = []
            ok = True
            for inp in eg.get("inputs") or []:
                ref = resolve_ref(inp["tag"])
                if not ref:
                    ok = False
                    break
                cons.append(make_entry(ref[0], ref[1], inp["kgPerSec"] * 1000.0, "g", "s"))
            for outp in eg.get("outputs") or []:
                ref = resolve_ref(outp["element"])
                if not ref:
                    ok = False
                    break
                prod.append(make_entry(ref[0], ref[1], outp["kgPerSec"] * 1000.0, "g", "s"))
            if ok and (cons or prod):
                add_recipe({"source": src_id, "consumed": cons, "produced": prod})

        # TinkerStation (Power Control Station, Farm Station)
        if b.get("tinkerStation"):
            ts = b["tinkerStation"]
            iref = resolve_ref(ts["inputMaterial"])
            oref = resolve_ref(ts["outputPrefab"]) if ts.get("outputPrefab") else None
            if iref:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry(iref[0], iref[1], ts["massPerTinkerKg"] * 1000.0, "g", "use")],
                    "produced": [make_entry(oref[0], oref[1], 1, "unit", "use")] if oref else [],
                })

        # FlushToilet (Lavatory, Wall Toilet)
        if b.get("flushToilet"):
            ft = b["flushToilet"]
            w = resolve_ref("Water")
            pw = resolve_ref("DirtyWater")
            if w and pw:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry(w[0], w[1], ft["massConsumedPerUseKg"] * 1000.0, "g", "use")],
                    "produced": [make_entry(pw[0], pw[1], ft["massEmittedPerUseKg"] * 1000.0, "g", "use")],
                })

        # Outhouse (Toilet)
        if b.get("outhouse"):
            oh = b["outhouse"]
            dirt = resolve_ref("Dirt")
            waste = resolve_ref(oh["solidWasteElement"])
            if dirt and waste:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry(dirt[0], dirt[1], oh["dirtUsedPerFlushKg"] * 1000.0, "g", "use")],
                    "produced": [make_entry(waste[0], waste[1], oh["solidWasteMassKg"] * 1000.0, "g", "use")],
                })

        # HandSanitizer / WashSink / WashBasin / DecontaminationShower
        if b.get("handSanitizer"):
            hs = b["handSanitizer"]
            cref = resolve_ref(hs["consumedElement"])
            oref = resolve_ref(hs["outputElement"]) if hs.get("outputElement") else None
            if cref:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry(cref[0], cref[1], hs["massConsumedPerUseKg"] * 1000.0, "g", "use")],
                    "produced": [make_entry(oref[0], oref[1], hs["massConsumedPerUseKg"] * 1000.0, "g", "use")] if oref else [],
                })

        # NuclearReactor
        if b.get("nuclearReactor"):
            nr = b["nuclearReactor"]
            fref = resolve_ref(nr["fuelElement"])
            wref = resolve_ref(nr["wasteElement"])
            if fref and wref:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry(fref[0], fref[1], nr["fuelKgPerSec"] * 1000.0, "g", "s")],
                    "produced": [make_entry(wref[0], wref[1], nr["wasteKgPerSec"] * 1000.0, "g", "s")],
                })

        # FoodRehydrator (1-to-1 concrete pairs derived from FoodDehydrator!)
        if b.get("rehydrator"):
            rh = b["rehydrator"]
            wref = resolve_ref(rh["waterTag"])
            for dehyd_gid, food_gid in sorted(dehydrated_to_food.items()):
                if dehyd_gid in game_to_site and food_gid in game_to_site and wref:
                    # 1 dehydrated package = 1000 kcal of original food
                    add_recipe({
                        "source": src_id,
                        "consumed": [
                            make_entry("element", game_to_site[dehyd_gid], 1, "unit", "use"),
                            make_entry(wref[0], wref[1], rh["waterKgPerUse"] * 1000.0, "g", "use"),
                        ],
                        "produced": [
                            make_entry("element", game_to_site[food_gid], 1000, "kcal", "use"),
                        ],
                    })

        # Per-use recreation & critter feeder recipes
        if b.get("perUseRecipes"):
            for pur in b["perUseRecipes"]:
                cons = []
                ok = True
                for item in pur.get("consumed") or []:
                    ref = resolve_ref(item["tag"])
                    if not ref:
                        ok = False
                        break
                    is_m = ref[0] == "tag" or is_mass_entity(item["tag"])
                    unit = "g" if is_m else "unit"
                    val = item["kg"] * 1000.0 if is_m else item["kg"]
                    cons.append(make_entry(ref[0], ref[1], val, unit, "use"))
                if ok and cons:
                    add_recipe({"source": src_id, "consumed": cons, "produced": []})

    # --- D. Plants ---
    for p in raw.get("plants", []):
        gid = p["id"]
        if gid not in game_to_site:
            continue
        src_id = game_to_site[gid]

        cons: list[dict[str, Any]] = []
        prod: list[dict[str, Any]] = []

        # Fertilization (AND)
        for f in p.get("fertilization") or []:
            ref = resolve_ref(f["tag"])
            if ref and f["kgPerSec"] > 0:
                cons.append(make_entry(ref[0], ref[1], f["kgPerSec"] * 1000.0, "g", "s"))

        # Irrigation (OR if >1, else AND)
        irr_list = p.get("irrigation") or []
        if len(irr_list) == 1:
            ref = resolve_ref(irr_list[0]["tag"])
            if ref and irr_list[0]["kgPerSec"] > 0:
                cons.append(make_entry(ref[0], ref[1], irr_list[0]["kgPerSec"] * 1000.0, "g", "s"))
        elif len(irr_list) > 1:
            irr_gids = [x["tag"] for x in irr_list if x["tag"] in game_to_site]
            tid = get_or_create_group_tag(irr_gids, f"{slugify(p['name'])}_irrigation", f"{p['name']} Irrigation")
            if tid:
                cons.append(make_entry("tag", tid, irr_list[0]["kgPerSec"] * 1000.0, "g", "s"))

        # Plant ElementConverters (e.g. Oxyfern)
        for ec in p.get("elementConverters") or []:
            for c in ec["consumed"]:
                ref = resolve_ref(c["tag"])
                if ref:
                    cons.append(make_entry(ref[0], ref[1], c["kgPerSec"] * 1000.0, "g", "s"))
            for o in ec["produced"]:
                ref = resolve_ref(o["element"])
                if ref:
                    prod.append(make_entry(ref[0], ref[1], o["kgPerSec"] * 1000.0, "g", "s"))

        # Standalone ElementConsumers (only if not already covered by converter, e.g. Dasha Saltvine, Alveo Vera, Megafrond)
        conv_cons_tags = {c["tag"] for ec in (p.get("elementConverters") or []) for c in ec["consumed"]}
        for ec_c in p.get("elementConsumers") or []:
            el_gid = ec_c.get("element")
            if el_gid and el_gid not in conv_cons_tags and ec_c.get("kgPerSec", 0) > 0:
                ref = resolve_ref(el_gid)
                if ref:
                    cons.append(make_entry(ref[0], ref[1], ec_c["kgPerSec"] * 1000.0, "g", "s"))

        # Standalone ElementEmitters
        for em in p.get("elementEmitters") or []:
            ref = resolve_ref(em["element"])
            if ref and em.get("kgPerSec", 0) > 0:
                prod.append(make_entry(ref[0], ref[1], em["kgPerSec"] * 1000.0, "g", "s"))

        # Crop production
        crop = p.get("crop")
        if crop and crop.get("cropDurationSec", 0) > 0:
            dur_s = crop["cropDurationSec"]
            # Arbor Tree grows 5 branches -> multiply branch crop by maxBranchCount for ForestTree
            branch_mult = 1
            if gid == "ForestTree" and p.get("branchGrower"):
                branch_mult = p["branchGrower"].get("maxBranchCount") or 5
            for cp in crop.get("products") or []:
                cid = cp["cropId"]
                if cid not in game_to_site:
                    continue
                qty = cp["quantity"] * branch_mult
                is_m = is_mass_entity(cid)
                if is_m:
                    rate_g_s = (qty * 1000.0) / dur_s
                    prod.append(make_entry("element", game_to_site[cid], rate_g_s, "g", "s"))
                else:
                    rate_u_s = qty / dur_s
                    prod.append(make_entry("element", game_to_site[cid], rate_u_s, "unit", "s"))

            # Bonus seed drop on harvest (SeedProducer.CropPickedInternal):
            # Only Harvest / HarvestOnly plants roll seedDropChances (0.1 base, modified by branch multiplier).
            # Exclude SpaceTree (Bonbon Tree): its 0.25-cycle sugar water harvest does NOT invoke SeedProducer.CropPicked.
            sp = p.get("seedProducer")
            if (
                gid != "SpaceTree"
                and sp
                and sp.get("productionType") in ("Harvest", "HarvestOnly")
                and sp.get("seedId") in game_to_site
            ):
                seed_gid = sp["seedId"]
                base_chance = sp.get("seedDropChance") or 0.1
                chance_mult = 0.125 if gid == "SeaTree" else ((1.0 / 6.0) if gid == "VineBranch" else 1.0)
                eff_chance = base_chance * chance_mult
                if eff_chance > 0:
                    pct_str = f"{eff_chance * 100.0:.2f}".rstrip("0").rstrip(".")
                    # 1 seed = 1 kg (1000 g) in ONI
                    seed_entry = make_entry("element", game_to_site[seed_gid], (eff_chance * 1000.0) / dur_s, "g", "s")
                    seed_entry["note"] = (
                        f"{pct_str}% base chance / branch"
                        if chance_mult < 1.0
                        else f"{pct_str}% base chance / harvest"
                    )
                    prod.append(seed_entry)

        if cons or prod:
            add_recipe({"source": src_id, "consumed": cons, "produced": prod})

        # Saturn Critter Trap (eats Walker/Hoverer critters -> emits Hydrogen!)
        if p.get("critterTrap"):
            ct = p["critterTrap"]
            out_ref = resolve_ref(ct["outputElement"])
            if out_ref and ct.get("gasOutputRateKgPerSec", 0) > 0:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry("tag", "saturn_trap_prey", 1, "unit")],
                    "produced": [make_entry(out_ref[0], out_ref[1], ct["gasOutputRateKgPerSec"] * 1000.0, "g", "s")],
                })

    # --- E. Critters ---
    for c in raw.get("critters", []):
        if c.get("isBaby") or c["id"] not in game_to_site:
            continue
        gid = c["id"]
        src_id = game_to_site[gid]
        kcal_per_cycle = c.get("kcalPerCycle") or 0.0

        # 1. Diet recipes!
        # Group calorie-based food diets (where consumedTags=[food_id] and food.kcalPerKg == diet.kcalPerKg and same producedElement & conversionRate)
        diet_list = c.get("diet") or []
        food_diet_groups: dict[tuple[str | None, float], list[str]] = defaultdict(list)
        other_diets: list[dict[str, Any]] = []

        for d in diet_list:
            ctags = d.get("consumedTags") or []
            if (
                d.get("foodType") == "EatSolid"
                and len(ctags) == 1
                and ctags[0] in raw_foods_by_id
                and raw_foods_by_id[ctags[0]].get("kcalPerKg", 0) > 0
                and abs(raw_foods_by_id[ctags[0]]["kcalPerKg"] - (d.get("kcalPerKg") or 0)) < 1.0
            ):
                food_diet_groups[(d.get("producedElement"), round_num(d.get("producedConversionRate") or 0))].append(ctags[0])
            else:
                other_diets.append(d)

        # Emit grouped calorie-based food diets (e.g. Hatch / Sage Hatch eating all 67 foods -> 1 single tag recipe!)
        if kcal_per_cycle > 0:
            for (prod_el, conv_rate), food_gids in food_diet_groups.items():
                if len(food_gids) >= 2:
                    edible_gids = {f["id"] for f in raw.get("foods", []) if "Edible" in (f.get("tags") or []) and f.get("kcalPerKg", 0) > 0}
                    if set(food_gids) >= edible_gids and len(food_gids) <= len(edible_gids) + 2:
                        tid = "edible"
                    else:
                        tid = get_or_create_group_tag(food_gids, f"{slugify(c['name'])}_food_diet", f"{c['name']} Edible Food")
                    if tid:
                        prod_entries = []
                        if prod_el and prod_el in game_to_site and conv_rate > 0:
                            # Dynamic mass output proportional to consumed food mass!
                            prod_entries.append({
                                "element": game_to_site[prod_el],
                                "amountRatioFromConsumed": conv_rate,
                                "unit": "g",
                                "per": "s",
                            })
                        add_recipe({
                            "source": src_id,
                            "consumed": [make_entry("tag", tid, kcal_per_cycle / 600.0, "kcal", "s")],
                            "produced": prod_entries,
                        })
                else:
                    # Single food item
                    fgid = food_gids[0]
                    if fgid in game_to_site:
                        fkcal = raw_foods_by_id[fgid]["kcalPerKg"]
                        cons_g_s = (kcal_per_cycle / fkcal) * 1000.0 / 600.0
                        prod_entries = []
                        if prod_el and prod_el in game_to_site and conv_rate > 0:
                            prod_entries.append(make_entry("element", game_to_site[prod_el], cons_g_s * conv_rate, "g", "s"))
                        add_recipe({
                            "source": src_id,
                            "consumed": [make_entry("element", game_to_site[fgid], cons_g_s, "g", "s")],
                            "produced": prod_entries,
                        })

        # Emit remaining Diet.Info entries (rocks, ores, seeds, gases, plants, prey)
        # First merge Diet.Info entries on the same critter that have identical (foodType, producedElement, kcalPerKg, producedConversionRate)
        merged_diets: dict[tuple[Any, ...], list[str]] = defaultdict(list)
        for d in other_diets:
            key = (
                d.get("foodType"),
                d.get("producedElement"),
                round_num(d.get("kcalPerKg") or 0),
                round_num(d.get("producedConversionRate") or 0),
            )
            for t in d.get("consumedTags") or []:
                if t in game_to_site:
                    merged_diets[key].append(t)

        for (ftype, prod_el, dkcal, conv_rate), c_gids in merged_diets.items():
            c_gids = sorted(set(c_gids))
            if not c_gids or kcal_per_cycle <= 0 or dkcal <= 0:
                continue

            if ftype == "EatSolid":
                cons_kg_cyc = kcal_per_cycle / dkcal
                prod_entries = []
                if prod_el and prod_el in game_to_site and conv_rate > 0:
                    prod_kg_cyc = cons_kg_cyc * conv_rate
                    prod_entries.append(make_entry("element", game_to_site[prod_el], prod_kg_cyc * 1000.0 / 600.0, "g", "s"))

                # Partition solid diet items by mass vs unit entities so unit-based items
                # (e.g. Pacu Treat, Dewdrip) never mix with mass-based items (e.g. elements, foods, seeds).
                unit_gids = [g for g in c_gids if not is_mass_entity(g)]
                mass_gids = [g for g in c_gids if is_mass_entity(g)]

                for grp, grp_is_mass in ((unit_gids, False), (mass_gids, True)):
                    if not grp:
                        continue
                    if len(grp) == 1:
                        in_kind, in_id = "element", game_to_site[grp[0]]
                    else:
                        if all(g in raw_seeds_by_id for g in grp):
                            sugg_id = f"{slugify(c['name'])}_seed_diet"
                            sugg_name = f"{c['name']} Seed Diet"
                        else:
                            sugg_id = f"{slugify(c['name'])}_diet_{slugify(prod_el or ftype or 'items')}"
                            sugg_name = f"{c['name']} Diet"
                        tid = get_or_create_group_tag(grp, sugg_id, sugg_name)
                        if not tid:
                            continue
                        in_kind, in_id = "tag", tid

                    if grp_is_mass:
                        cons_entry = make_entry(in_kind, in_id, cons_kg_cyc * 1000.0 / 600.0, "g", "s")
                    else:
                        cons_entry = make_entry(in_kind, in_id, cons_kg_cyc / 600.0, "unit", "s")
                    add_recipe({"source": src_id, "consumed": [cons_entry], "produced": list(prod_entries)})
                continue

            # Resolve input ref (concrete if 1, tag if >=2) for non-EatSolid diets
            if len(c_gids) == 1:
                in_kind, in_id = "element", game_to_site[c_gids[0]]
            else:
                tid = get_or_create_group_tag(
                    c_gids,
                    f"{slugify(c['name'])}_diet_{slugify(prod_el or ftype or 'items')}",
                    f"{c['name']} Diet",
                )
                if not tid:
                    continue
                in_kind, in_id = "tag", tid

            prod_entries = []
            if ftype == "EatPlantDirectly":
                growth_per_cyc = kcal_per_cycle / dkcal  # 1.0 = 100% growth
                cons_entry = make_entry(in_kind, in_id, (growth_per_cyc * 100.0) / 600.0, "% growth", "s")
                if prod_el and prod_el in game_to_site and conv_rate > 0:
                    prod_kg_cyc = growth_per_cyc * conv_rate
                    prod_entries.append(make_entry("element", game_to_site[prod_el], prod_kg_cyc * 1000.0 / 600.0, "g", "s"))
                add_recipe({"source": src_id, "consumed": [cons_entry], "produced": prod_entries})

            elif ftype == "EatPlantStorage":
                kg_per_cyc = kcal_per_cycle / dkcal
                cons_entry = make_entry(in_kind, in_id, kg_per_cyc * 1000.0 / 600.0, "g of stored Nectar", "s")
                if prod_el and prod_el in game_to_site and conv_rate > 0:
                    prod_kg_cyc = kg_per_cyc * conv_rate
                    prod_entries.append(make_entry("element", game_to_site[prod_el], prod_kg_cyc * 1000.0 / 600.0, "g", "s"))
                add_recipe({"source": src_id, "consumed": [cons_entry], "produced": prod_entries})

            elif ftype == "EatPrey":
                # Prey mass * dkcal = kcal per prey unit
                first_prey = raw_critters_by_id.get(c_gids[0])
                prey_mass = first_prey.get("massKg", 1.0) if first_prey else 1.0
                if prey_mass <= 0:
                    prey_mass = 1.0
                units_per_cyc = kcal_per_cycle / (prey_mass * dkcal)
                cons_entry = make_entry(in_kind, in_id, units_per_cyc / 600.0, "unit", "s")
                if prod_el and prod_el in game_to_site and conv_rate > 0:
                    prod_kg_cyc = units_per_cyc * prey_mass * conv_rate
                    prod_entries.append(make_entry("element", game_to_site[prod_el], prod_kg_cyc * 1000.0 / 600.0, "g", "s"))
                add_recipe({"source": src_id, "consumed": [cons_entry], "produced": prod_entries})

            elif ftype == "EatButcheredPrey":
                units_per_cyc = kcal_per_cycle / dkcal
                cons_entry = make_entry(in_kind, in_id, units_per_cyc / 600.0, "unit", "s")
                if prod_el and prod_el in game_to_site and conv_rate > 0:
                    prod_kg_cyc = units_per_cyc * conv_rate
                    prod_entries.append(make_entry("element", game_to_site[prod_el], prod_kg_cyc * 1000.0 / 600.0, "g", "s"))
                add_recipe({"source": src_id, "consumed": [cons_entry], "produced": prod_entries})

        # 2. Critter ElementConverters (e.g. Gulp Fish cleaning Polluted Water -> Water)
        for ec in c.get("elementConverters") or []:
            cons = []
            prod = []
            ok = True
            for ci in ec["consumed"]:
                ref = resolve_ref(ci["tag"])
                if not ref:
                    ok = False
                    break
                cons.append(make_entry(ref[0], ref[1], ci["kgPerSec"] * 1000.0, "g", "s"))
            for oi in ec["produced"]:
                ref = resolve_ref(oi["element"])
                if not ref:
                    ok = False
                    break
                prod.append(make_entry(ref[0], ref[1], oi["kgPerSec"] * 1000.0, "g", "s"))
            if ok and (cons or prod):
                add_recipe({"source": src_id, "consumed": cons, "produced": prod})

        # 3. Shearing (ScaleGrowth / WellFedShearable — Drecko, Bammoth, Flox, Rhex, Orehull)
        is_swimmer = "Swimmer" in (c.get("tags") or [])
        shear_station_gid = "UnderwaterShearingStation" if is_swimmer else "ShearingStation"
        for sh in c.get("shearables") or []:
            item_gid = sh.get("itemDropped")
            if item_gid and item_gid in game_to_site and sh.get("growthCycles", 0) > 0:
                is_m = is_mass_entity(item_gid)
                rate = (sh["dropMassKg"] * (1000.0 if is_m else 1.0)) / (sh["growthCycles"] * 600.0)
                add_recipe({
                    "source": src_id,
                    "consumed": [],
                    "produced": [make_entry("element", game_to_site[item_gid], rate, "g" if is_m else "unit", "s")],
                })
                if shear_station_gid in game_to_site:
                    add_recipe({
                        "source": game_to_site[shear_station_gid],
                        "consumed": [make_entry("element", src_id, 1, "unit")],
                        "produced": [make_entry("element", game_to_site[item_gid], rate, "g" if is_m else "unit", "s")],
                    })

        # 4. Milk / Ink production (Gassy Moo, Glo Squid)
        milk_station_gid = "UnderwaterMilkingStation" if is_swimmer else "MilkingStation"
        milk = c.get("milkProduction")
        if milk and milk.get("element") in game_to_site and milk.get("capacityKg", 0) > 0:
            milk_rate = (milk["capacityKg"] / 4.0) * 1000.0 / 600.0
            add_recipe({
                "source": src_id,
                "consumed": [],
                "produced": [make_entry("element", game_to_site[milk["element"]], milk_rate, "g", "s")],
            })
            if milk_station_gid in game_to_site:
                add_recipe({
                    "source": game_to_site[milk_station_gid],
                    "consumed": [make_entry("element", src_id, 1, "unit")],
                    "produced": [make_entry("element", game_to_site[milk["element"]], milk_rate, "g", "s")],
                })

        # 5. ElementDropperMonitor (Morb -> Polluted Oxygen)
        edrop = c.get("elementDropper")
        if edrop and edrop.get("element") in game_to_site and edrop.get("massPerDropKg", 0) > 0:
            add_recipe({
                "source": src_id,
                "consumed": [],
                "produced": [make_entry("element", game_to_site[edrop["element"]], edrop["massPerDropKg"] * 1000.0, "g", "use")],
            })

        # 6. Butcher drops (Variant B: tame happy reproduction rate = baseFertileCycles / 10;
        #    for non-egg-laying critters without fertility, use Age.max lifespan from Assembly-CSharp.dll)
        NO_EGG_CRITTER_LIFESPAN = {
            "Moo": 75.0,
            "DieselMoo": 75.0,
            "Butterfly": 5.0,
            "SeaFairy": 5.0,
        }
        fert = c.get("fertility")
        tame_egg_cycles = (fert["baseFertileCycles"] / 10.0) if (fert and fert.get("baseFertileCycles", 0) > 0) else 0.0
        drop_cycles = tame_egg_cycles if tame_egg_cycles > 0 else NO_EGG_CRITTER_LIFESPAN.get(gid, 0.0)
        drops = c.get("butcherDrops") or {}
        if drops:
            prod = []
            for d_gid, qty in drops.items():
                if d_gid in game_to_site and qty > 0:
                    is_m = is_mass_entity(d_gid)
                    base_val = qty * (1000.0 if is_m else 1.0)
                    unit = "g" if is_m else "unit"
                    if drop_cycles > 0:
                        prod.append(make_entry("element", game_to_site[d_gid], base_val / (drop_cycles * 600.0), unit, "s"))
                    else:
                        prod.append(make_entry("element", game_to_site[d_gid], base_val, unit))
            if prod:
                add_recipe({"source": src_id, "consumed": [], "produced": prod})

        # 7. Egg laying (FertilityMonitor — tame happy rate = baseFertileCycles / 10, matching ranching rates)
        if tame_egg_cycles > 0:
            egg_gids = [bw["eggId"] for bw in (fert.get("breedingWeights") or []) if bw["eggId"] in game_to_site]
            if egg_gids:
                # Primary egg (first in list / highest weight)
                primary_egg = max(fert["breedingWeights"], key=lambda x: x["weight"])["eggId"]
                if primary_egg in game_to_site:
                    add_recipe({
                        "source": src_id,
                        "consumed": [],
                        "produced": [make_entry("element", game_to_site[primary_egg], 1.0 / (tame_egg_cycles * 600.0), "unit", "s")],
                    })

    # --- F. Duplicants & Bionic Duplicants ---
    for dup in raw.get("duplicants", []):
        gid = dup["id"]
        if gid not in game_to_site:
            continue
        src_id = game_to_site[gid]

        # Breathing
        o2_ref = resolve_ref("Oxygen")
        co2_ref = resolve_ref("CarbonDioxide")
        if o2_ref and dup.get("oxygenKgPerSec", 0) > 0:
            prod = []
            if co2_ref and dup.get("co2KgPerSec", 0) > 0:
                prod.append(make_entry(co2_ref[0], co2_ref[1], dup["co2KgPerSec"] * 1000.0, "g", "s"))
            add_recipe({
                "source": src_id,
                "consumed": [make_entry(o2_ref[0], o2_ref[1], dup["oxygenKgPerSec"] * 1000.0, "g", "s")],
                "produced": prod,
            })

        # Standard Duplicant eating (#edible — 1 single tag recipe!)
        if dup.get("kcalPerCycle", 0) > 0 and "edible" in tags_registry:
            add_recipe({
                "source": src_id,
                "consumed": [make_entry("tag", "edible", dup["kcalPerCycle"] / 600.0, "kcal", "s")],
                "produced": [],
            })

        # Bionic Duplicant maintenance (Power Banks + Lubricant -> Liquid Gunk)
        # Per GameTags.BionicCompatibleBatteries & BionicIncompatibleBatteries:
        # - Disposable Power Banks (Metal Power Bank, Uranium Ore Power Bank) are consumed completely
        # - Eco Power Bank is discharged into Empty Eco Power Bank
        # - Atomic Power Bank (SelfChargingElectrobank) is explicitly incompatible with Bionic Duplicants
        if gid == "BionicMinion":
            if "disposable_power_bank" in tags_registry:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry("tag", "disposable_power_bank", 1.0 / 600.0, "unit", "s")],
                    "produced": [],
                })
            eco_ref = resolve_ref("Electrobank")
            empty_eco_ref = resolve_ref("EmptyElectrobank")
            if eco_ref:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry(eco_ref[0], eco_ref[1], 1.0 / 600.0, "unit", "s")],
                    "produced": [make_entry(empty_eco_ref[0], empty_eco_ref[1], 1.0 / 600.0, "unit", "s")] if empty_eco_ref else [],
                })
            gunk_ref = resolve_ref("LiquidGunk")
            if "lubricating_oil" in tags_registry and dup.get("oilKgPerSec", 0) > 0:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry("tag", "lubricating_oil", dup["oilKgPerSec"] * 1000.0, "g", "s")],
                    "produced": [make_entry(gunk_ref[0], gunk_ref[1], dup["oilKgPerSec"] * 1000.0, "g", "s")] if gunk_ref else [],
                })
            if "solid_lubricant" in tags_registry:
                add_recipe({
                    "source": src_id,
                    "consumed": [make_entry("tag", "solid_lubricant", 0.25 / 600.0, "unit", "s")],
                    "produced": [make_entry(gunk_ref[0], gunk_ref[1], 20000.0 / 600.0, "g", "s")] if gunk_ref else [],
                })

    # --- G. Geysers ---
    for g in raw.get("geysers", []):
        gid = g["id"]
        if gid not in game_to_site:
            continue
        out_ref = resolve_ref(g["element"])
        if not out_ref:
            continue
        # Lifetime average emission per GeyserConfigurator.GetAverageEmission():
        # minRatePerCycle..maxRatePerCycle already includes pauses between eruptions
        # (iterationPercent cancels out), so lifetime avg = (massPerCycle / 600) * yearPercent.
        min_g_s = (g["minRatePerCycleKg"] / 600.0) * g["minYearPercent"] * 1000.0
        max_g_s = (g["maxRatePerCycleKg"] / 600.0) * g["maxYearPercent"] * 1000.0
        avg_g_s = ((g["minRatePerCycleKg"] + g["maxRatePerCycleKg"]) / 2.0 / 600.0) * ((g["minYearPercent"] + g["maxYearPercent"]) / 2.0) * 1000.0
        if avg_g_s > 0:
            entry = make_entry(out_ref[0], out_ref[1], avg_g_s, "g", "s")
            entry["amountMin"] = round_num(min_g_s)
            entry["amountMax"] = round_num(max_g_s)
            add_recipe({
                "source": game_to_site[gid],
                "consumed": [],
                "produced": [entry],
            })

    # --- H. Manual Overrides (exporter/overrides.json) ---
    for ov in overrides.get("extraRecipes", []):
        if ov.get("source") in ("heat", "cool", "emit"):
            src_id = ov["source"]
        else:
            sgid = ov.get("sourceGameId")
            if not sgid or sgid not in game_to_site:
                continue
            src_id = game_to_site[sgid]
        cons = []
        prod = []
        for x in ov.get("consumed") or []:
            if "gameId" in x and x["gameId"] in game_to_site:
                cons.append(make_entry("element", game_to_site[x["gameId"]], x["amount"], x["unit"], x.get("per")))
            elif "tag" in x and x["tag"] in tags_registry:
                cons.append(make_entry("tag", x["tag"], x["amount"], x["unit"], x.get("per")))
        for x in ov.get("produced") or []:
            if "gameId" in x and x["gameId"] in game_to_site:
                prod.append(make_entry("element", game_to_site[x["gameId"]], x["amount"], x["unit"], x.get("per")))
            elif "tag" in x and x["tag"] in tags_registry:
                prod.append(make_entry("tag", x["tag"], x["amount"], x["unit"], x.get("per")))
        rec: dict[str, Any] = {"source": src_id, "consumed": cons, "produced": prod}
        if ov.get("temp") is not None:
            rec["temp"] = round_num(ov["temp"])
        if ov.get("time") is not None:
            rec["time"] = round_num(ov["time"])
        add_recipe(rec)

    # =========================================================================
    # PRUNE UNUSED TAGS & ATTACH FINAL TAGS TO ITEMS
    # =========================================================================
    used_tags_in_recipes: set[str] = set()
    for r in recipes:
        for side in (r.get("consumed") or [], r.get("produced") or []):
            for entry in side:
                if "tag" in entry:
                    used_tags_in_recipes.add(entry["tag"])

    # Keep all tags used in recipes + core gameplay tags (filter, refined_metal, building_wood, edible, etc.)
    core_tags = set(GAME_TAG_TO_SITE_TAG.values()) | {"saturn_trap_prey", "fiber", "grain"}
    kept_tags = used_tags_in_recipes | (core_tags & set(tags_registry.keys()))

    final_tags_list: list[dict[str, Any]] = []
    for tid in sorted(kept_tags):
        if tid not in tags_registry:
            continue
        members = sorted(sid for sid, tset in item_tags.items() if tid in tset)
        if not members:
            continue
        t_obj = dict(tags_registry[tid])
        if not t_obj.get("image"):
            t_obj["image"] = site_items[members[0]]["image"]
        final_tags_list.append(t_obj)

    valid_kept_tag_ids = {t["id"] for t in final_tags_list}
    for sid, obj in site_items.items():
        tlist = sorted(t for t in item_tags.get(sid, set()) if t in valid_kept_tag_ids)
        if tlist:
            obj["tags"] = tlist

    # Sort each bucket alphabetically by name
    for cat in buckets:
        buckets[cat].sort(key=lambda x: (x["name"].lower(), x["id"]))

    # =========================================================================
    # WRITE OUTPUT FILES
    # =========================================================================
    file_map = {
        "duplicant": "duplicants.json",
        "critter": "critters.json",
        "building": "buildings.json",
        "food": "foods.json",
        "plant": "plants.json",
        "seed": "seeds.json",
        "egg": "eggs.json",
        "geyser": "geysers.json",
        "gas": "gases.json",
        "liquid": "liquids.json",
        "solid": "solids.json",
        "artifact": "artifacts.json",
        "other": "others.json",
    }

    for cat, fname in file_map.items():
        (DATA_DIR / fname).write_text(
            json.dumps(buckets[cat], indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    (DATA_DIR / "tags.json").write_text(
        json.dumps(final_tags_list, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    (DATA_DIR / "recipes.json").write_text(
        json.dumps(recipes, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    config = [
        {"id": "duplicant", "label": "Duplicants", "file": "duplicants.json", "isFilter": True},
        {"id": "critter", "label": "Critters", "file": "critters.json", "isFilter": True},
        {"id": "building", "label": "Buildings", "file": "buildings.json", "isFilter": True},
        {"id": "food", "label": "Foods", "file": "foods.json", "isFilter": True},
        {"id": "plant", "label": "Plants", "file": "plants.json", "isFilter": True},
        {"id": "seed", "label": "Seeds", "file": "seeds.json", "isFilter": True},
        {"id": "egg", "label": "Eggs", "file": "eggs.json", "isFilter": True},
        {"id": "geyser", "label": "Geysers", "file": "geysers.json", "isFilter": True},
        {"id": "gas", "label": "Gases", "file": "gases.json", "isFilter": True},
        {"id": "liquid", "label": "Liquids", "file": "liquids.json", "isFilter": True},
        {"id": "solid", "label": "Solids", "file": "solids.json", "isFilter": True},
        {"id": "artifact", "label": "Artifacts", "file": "artifacts.json", "isFilter": True},
        {"id": "other", "label": "Others", "file": "others.json", "isFilter": True},
        {"id": "special", "label": "Special", "file": "special.json", "isFilter": False},
        {"id": "recipe", "label": "Recipes", "file": "recipes.json", "isFilter": False},
    ]
    (DATA_DIR / "config.json").write_text(
        json.dumps(config, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # Save deterministic gameId -> siteId map for future runs
    ID_MAP_PATH.write_text(
        json.dumps(dict(sorted(game_to_site.items())), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # Report missing images & generate icon_manifest.json for the ONI C# exporter
    missing_imgs: list[str] = []
    icon_manifest: dict[str, str] = {}
    for cat, items in buckets.items():
        for obj in items:
            if obj["image"].lower() not in img_index:
                missing_imgs.append(f"{cat}\t{obj['id']}\t{obj['gameId']}\t{obj['name']}\t{obj['image']}")
                icon_manifest[obj["gameId"]] = obj["image"]
    MISSING_IMAGES_PATH.write_text("\n".join(missing_imgs) + "\n", encoding="utf-8")
    ICON_MANIFEST_PATH.write_text(json.dumps(icon_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Integrity & Summary stats
    tag_recipes_count = sum(
        1 for r in recipes
        if any("tag" in x for x in (r.get("consumed") or []) + (r.get("produced") or []))
    )
    expanded_total = 0
    for r in recipes:
        mult = 1
        for x in (r.get("consumed") or []) + (r.get("produced") or []):
            if "tag" in x:
                cnt = sum(1 for s, ts in item_tags.items() if x["tag"] in ts)
                mult *= max(cnt, 1)
        expanded_total += mult

    print("=== BUILD DATA SUMMARY ===")
    for cat, items in buckets.items():
        have_img = sum(1 for o in items if o["image"].lower() in img_index)
        print(f"  {cat:10s}: {len(items):4d} items  (images found: {have_img}/{len(items)})")
    print(f"  tags      : {len(final_tags_list):4d} tags")
    print(f"  recipes   : {len(recipes):4d} compact recipes ({tag_recipes_count} tag-grouped -> expands to {expanded_total} concrete recipes!)")
    print(f"  missing images logged to: {MISSING_IMAGES_PATH} ({len(missing_imgs)} total)")


if __name__ == "__main__":
    main()
