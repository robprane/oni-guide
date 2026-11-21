using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace OniGuideExporter
{
    public class ExportRoot
    {
        [JsonProperty("meta")] public ExportMeta Meta { get; set; } = new ExportMeta();
        [JsonProperty("elements")] public List<ElementDto> Elements { get; set; } = new List<ElementDto>();
        [JsonProperty("tags")] public Dictionary<string, TagDto> Tags { get; set; } = new Dictionary<string, TagDto>();
        [JsonProperty("foods")] public List<FoodDto> Foods { get; set; } = new List<FoodDto>();
        [JsonProperty("buildings")] public List<BuildingDto> Buildings { get; set; } = new List<BuildingDto>();
        [JsonProperty("complexRecipesPreProcess")] public List<ComplexRecipeDto> ComplexRecipesPreProcess { get; set; } = new List<ComplexRecipeDto>();
        [JsonProperty("complexRecipesExpanded")] public List<ComplexRecipeDto> ComplexRecipesExpanded { get; set; } = new List<ComplexRecipeDto>();
        [JsonProperty("critters")] public List<CritterDto> Critters { get; set; } = new List<CritterDto>();
        [JsonProperty("eggs")] public List<EggDto> Eggs { get; set; } = new List<EggDto>();
        [JsonProperty("plants")] public List<PlantDto> Plants { get; set; } = new List<PlantDto>();
        [JsonProperty("seeds")] public List<SeedDto> Seeds { get; set; } = new List<SeedDto>();
        [JsonProperty("duplicants")] public List<DuplicantDto> Duplicants { get; set; } = new List<DuplicantDto>();
        [JsonProperty("geysers")] public List<GeyserDto> Geysers { get; set; } = new List<GeyserDto>();
        [JsonProperty("items")] public List<ItemDto> Items { get; set; } = new List<ItemDto>();
    }

    public class ExportMeta
    {
        [JsonProperty("gameBuild")] public string GameBuild { get; set; }
        [JsonProperty("exportedAtUtc")] public string ExportedAtUtc { get; set; }
        [JsonProperty("activeDlcs")] public List<string> ActiveDlcs { get; set; } = new List<string>();
        [JsonProperty("subscribedDlcs")] public List<string> SubscribedDlcs { get; set; } = new List<string>();
        [JsonProperty("language")] public string Language { get; set; }
        [JsonProperty("errors")] public List<string> Errors { get; set; } = new List<string>();
    }

    public class TagDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("elementMembers")] public List<string> ElementMembers { get; set; } = new List<string>();
        [JsonProperty("prefabMembers")] public List<string> PrefabMembers { get; set; } = new List<string>();
    }

    public class ElementDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("tag")] public string Tag { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("state")] public string State { get; set; }
        [JsonProperty("isDisabled")] public bool IsDisabled { get; set; }
        [JsonProperty("materialCategory")] public string MaterialCategory { get; set; }
        [JsonProperty("oreTags")] public List<string> OreTags { get; set; } = new List<string>();
        [JsonProperty("specificHeatCapacity")] public float SpecificHeatCapacity { get; set; }
        [JsonProperty("thermalConductivity")] public float ThermalConductivity { get; set; }
        [JsonProperty("molarMass")] public float MolarMass { get; set; }
        [JsonProperty("defaultTempC")] public float DefaultTempC { get; set; }
        [JsonProperty("radiationPer1000Mass")] public float RadiationPer1000Mass { get; set; }
        [JsonProperty("refinedMetalTarget")] public string RefinedMetalTarget { get; set; }
        [JsonProperty("highTempC")] public float? HighTempC { get; set; }
        [JsonProperty("highTempTransitionTarget")] public string HighTempTransitionTarget { get; set; }
        [JsonProperty("highTempTransitionOreId")] public string HighTempTransitionOreId { get; set; }
        [JsonProperty("highTempTransitionOreMassConversion")] public float HighTempTransitionOreMassConversion { get; set; }
        [JsonProperty("lowTempC")] public float? LowTempC { get; set; }
        [JsonProperty("lowTempTransitionTarget")] public string LowTempTransitionTarget { get; set; }
        [JsonProperty("lowTempTransitionOreId")] public string LowTempTransitionOreId { get; set; }
        [JsonProperty("lowTempTransitionOreMassConversion")] public float LowTempTransitionOreMassConversion { get; set; }
        [JsonProperty("sublimateId")] public string SublimateId { get; set; }
        [JsonProperty("sublimateRate")] public float SublimateRate { get; set; }
        [JsonProperty("sublimateEfficiency")] public float SublimateEfficiency { get; set; }
        [JsonProperty("sublimateProbability")] public float SublimateProbability { get; set; }
        [JsonProperty("offGasPercentage")] public float OffGasPercentage { get; set; }
        [JsonProperty("prefabSublimates")] public SublimatesDto PrefabSublimates { get; set; }
    }

    public class FoodDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("kcalPerKg")] public float KcalPerKg { get; set; }
        [JsonProperty("quality")] public int Quality { get; set; }
        [JsonProperty("canRot")] public bool CanRot { get; set; }
        [JsonProperty("spoilTimeSec")] public float SpoilTimeSec { get; set; }
        [JsonProperty("preserveTempC")] public float PreserveTempC { get; set; }
        [JsonProperty("rotTempC")] public float RotTempC { get; set; }
        [JsonProperty("cooked")] public bool Cooked { get; set; }
        [JsonProperty("effects")] public List<string> Effects { get; set; } = new List<string>();
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new List<string>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }
    }

    public class ElementConverterDto
    {
        [JsonProperty("consumed")] public List<RateElementDto> Consumed { get; set; } = new List<RateElementDto>();
        [JsonProperty("produced")] public List<OutputElementDto> Produced { get; set; } = new List<OutputElementDto>();
    }

    public class RateElementDto
    {
        [JsonProperty("tag")] public string Tag { get; set; }
        [JsonProperty("kgPerSec")] public float KgPerSec { get; set; }
    }

    public class OutputElementDto
    {
        [JsonProperty("element")] public string Element { get; set; }
        [JsonProperty("kgPerSec")] public float KgPerSec { get; set; }
        [JsonProperty("minOutputTempC")] public float? MinOutputTempC { get; set; }
        [JsonProperty("useEntityTemperature")] public bool UseEntityTemperature { get; set; }
        [JsonProperty("storeOutput")] public bool StoreOutput { get; set; }
    }

    public class EnergyGeneratorDto
    {
        [JsonProperty("wattage")] public float Wattage { get; set; }
        [JsonProperty("inputs")] public List<RateElementDto> Inputs { get; set; } = new List<RateElementDto>();
        [JsonProperty("outputs")] public List<OutputElementDto> Outputs { get; set; } = new List<OutputElementDto>();
    }

    public class ElementConsumerDto
    {
        [JsonProperty("element")] public string Element { get; set; }
        [JsonProperty("configuration")] public string Configuration { get; set; }
        [JsonProperty("kgPerSec")] public float KgPerSec { get; set; }
        [JsonProperty("storeOnConsume")] public bool StoreOnConsume { get; set; }
        [JsonProperty("isPassive")] public bool IsPassive { get; set; }
    }

    public class ElementEmitterDto
    {
        [JsonProperty("element")] public string Element { get; set; }
        [JsonProperty("kgPerSec")] public float KgPerSec { get; set; }
        [JsonProperty("emissionFrequency")] public float EmissionFrequency { get; set; }
        [JsonProperty("maxPressure")] public float MaxPressure { get; set; }
        [JsonProperty("minOutputTempC")] public float? MinOutputTempC { get; set; }
    }

    public class SublimatesDto
    {
        [JsonProperty("element")] public string Element { get; set; }
        [JsonProperty("sublimationRate")] public float SublimationRate { get; set; }
        [JsonProperty("minSublimationAmount")] public float MinSublimationAmount { get; set; }
        [JsonProperty("maxDestinationMass")] public float MaxDestinationMass { get; set; }
        [JsonProperty("massPower")] public float MassPower { get; set; }
    }

    public class ManualDeliveryDto
    {
        [JsonProperty("requestedItemTag")] public string RequestedItemTag { get; set; }
        [JsonProperty("capacityKg")] public float CapacityKg { get; set; }
        [JsonProperty("refillMassKg")] public float RefillMassKg { get; set; }
    }

    public class TinkerStationDto
    {
        [JsonProperty("inputMaterial")] public string InputMaterial { get; set; }
        [JsonProperty("massPerTinkerKg")] public float MassPerTinkerKg { get; set; }
        [JsonProperty("outputPrefab")] public string OutputPrefab { get; set; }
        [JsonProperty("toolProductionTimeSec")] public float ToolProductionTimeSec { get; set; }
    }

    public class FlushToiletDto
    {
        [JsonProperty("massConsumedPerUseKg")] public float MassConsumedPerUseKg { get; set; }
        [JsonProperty("massEmittedPerUseKg")] public float MassEmittedPerUseKg { get; set; }
        [JsonProperty("newPeeTempC")] public float NewPeeTempC { get; set; }
    }

    public class OuthouseDto
    {
        [JsonProperty("dirtUsedPerFlushKg")] public float DirtUsedPerFlushKg { get; set; }
        [JsonProperty("solidWasteElement")] public string SolidWasteElement { get; set; }
        [JsonProperty("solidWasteMassKg")] public float SolidWasteMassKg { get; set; }
        [JsonProperty("maxFlushes")] public int MaxFlushes { get; set; }
    }

    public class HandSanitizerDto
    {
        [JsonProperty("consumedElement")] public string ConsumedElement { get; set; }
        [JsonProperty("outputElement")] public string OutputElement { get; set; }
        [JsonProperty("massConsumedPerUseKg")] public float MassConsumedPerUseKg { get; set; }
    }

    public class ResearchCenterDto
    {
        [JsonProperty("inputMaterial")] public string InputMaterial { get; set; }
        [JsonProperty("massPerPointKg")] public float MassPerPointKg { get; set; }
        [JsonProperty("researchPointTypeId")] public string ResearchPointTypeId { get; set; }
    }

    public class OilWellCapDto
    {
        [JsonProperty("gasElement")] public string GasElement { get; set; }
        [JsonProperty("addGasRateKgPerSec")] public float AddGasRateKgPerSec { get; set; }
        [JsonProperty("gasTempC")] public float GasTempC { get; set; }
    }

    public class RocketEngineDto
    {
        [JsonProperty("fuelTag")] public string FuelTag { get; set; }
        [JsonProperty("requireOxidizer")] public bool RequireOxidizer { get; set; }
        [JsonProperty("exhaustElement")] public string ExhaustElement { get; set; }
        [JsonProperty("exhaustEmitRateKgPerSec")] public float ExhaustEmitRateKgPerSec { get; set; }
        [JsonProperty("exhaustTempC")] public float ExhaustTempC { get; set; }
        [JsonProperty("efficiency")] public float Efficiency { get; set; }
        [JsonProperty("isCluster")] public bool IsCluster { get; set; }
    }

    public class BuildingDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("effect")] public string Effect { get; set; }
        [JsonProperty("width")] public int Width { get; set; }
        [JsonProperty("height")] public int Height { get; set; }
        [JsonProperty("powerConsumption")] public float PowerConsumption { get; set; }
        [JsonProperty("powerGeneration")] public float PowerGeneration { get; set; }
        [JsonProperty("exhaustHeatKw")] public float ExhaustHeatKw { get; set; }
        [JsonProperty("selfHeatKw")] public float SelfHeatKw { get; set; }
        [JsonProperty("constructionMaterials")] public string[] ConstructionMaterials { get; set; }
        [JsonProperty("constructionMass")] public float[] ConstructionMass { get; set; }
        [JsonProperty("showInBuildMenu")] public bool ShowInBuildMenu { get; set; }
        [JsonProperty("deprecated")] public bool Deprecated { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new List<string>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }

        [JsonProperty("elementConverters")] public List<ElementConverterDto> ElementConverters { get; set; }
        [JsonProperty("energyGenerator")] public EnergyGeneratorDto EnergyGenerator { get; set; }
        [JsonProperty("elementConsumers")] public List<ElementConsumerDto> ElementConsumers { get; set; }
        [JsonProperty("elementEmitters")] public List<ElementEmitterDto> ElementEmitters { get; set; }
        [JsonProperty("tinkerStation")] public TinkerStationDto TinkerStation { get; set; }
        [JsonProperty("flushToilet")] public FlushToiletDto FlushToilet { get; set; }
        [JsonProperty("outhouse")] public OuthouseDto Outhouse { get; set; }
        [JsonProperty("handSanitizer")] public HandSanitizerDto HandSanitizer { get; set; }
        [JsonProperty("researchCenter")] public ResearchCenterDto ResearchCenter { get; set; }
        [JsonProperty("oilWellCap")] public OilWellCapDto OilWellCap { get; set; }
        [JsonProperty("rocketEngine")] public RocketEngineDto RocketEngine { get; set; }
        [JsonProperty("nuclearReactor")] public NuclearReactorDto NuclearReactor { get; set; }
        [JsonProperty("rehydrator")] public RehydratorDto Rehydrator { get; set; }
        [JsonProperty("perUseRecipes")] public List<PerUseRecipeDto> PerUseRecipes { get; set; }
        [JsonProperty("manualDeliveries")] public List<ManualDeliveryDto> ManualDeliveries { get; set; }
        [JsonProperty("sublimates")] public SublimatesDto Sublimates { get; set; }
    }

    public class NuclearReactorDto
    {
        [JsonProperty("fuelElement")] public string FuelElement { get; set; }
        [JsonProperty("fuelKgPerSec")] public float FuelKgPerSec { get; set; }
        [JsonProperty("wasteElement")] public string WasteElement { get; set; }
        [JsonProperty("wasteKgPerSec")] public float WasteKgPerSec { get; set; }
        [JsonProperty("coolantElement")] public string CoolantElement { get; set; }
        [JsonProperty("coolantCapacityKg")] public float CoolantCapacityKg { get; set; }
        [JsonProperty("ventSteamTempC")] public float VentSteamTempC { get; set; }
    }

    public class RehydratorDto
    {
        [JsonProperty("waterTag")] public string WaterTag { get; set; }
        [JsonProperty("waterKgPerUse")] public float WaterKgPerUse { get; set; }
        [JsonProperty("foodTag")] public string FoodTag { get; set; }
    }

    public class PerUseItemDto
    {
        [JsonProperty("tag")] public string Tag { get; set; }
        [JsonProperty("kg")] public float Kg { get; set; }
    }

    public class PerUseRecipeDto
    {
        [JsonProperty("kind")] public string Kind { get; set; }
        [JsonProperty("consumed")] public List<PerUseItemDto> Consumed { get; set; } = new List<PerUseItemDto>();
        [JsonProperty("produced")] public List<PerUseItemDto> Produced { get; set; } = new List<PerUseItemDto>();
    }

    public class ComplexRecipeElementDto
    {
        [JsonProperty("material")] public string Material { get; set; }
        [JsonProperty("possibleMaterials")] public List<string> PossibleMaterials { get; set; }
        [JsonProperty("possibleMaterialAmounts")] public List<float> PossibleMaterialAmounts { get; set; }
        [JsonProperty("amount")] public float Amount { get; set; }
        [JsonProperty("doNotConsume")] public bool DoNotConsume { get; set; }
        [JsonProperty("inheritElement")] public bool InheritElement { get; set; }
        [JsonProperty("storeElement")] public bool StoreElement { get; set; }
        [JsonProperty("temperatureOperation")] public string TemperatureOperation { get; set; }
        [JsonProperty("facadeId")] public string FacadeId { get; set; }
    }

    public class ComplexRecipeDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("recipeCategoryId")] public string RecipeCategoryId { get; set; }
        [JsonProperty("fabricators")] public List<string> Fabricators { get; set; } = new List<string>();
        [JsonProperty("timeSec")] public float TimeSec { get; set; }
        [JsonProperty("consumedHep")] public int ConsumedHep { get; set; }
        [JsonProperty("producedHep")] public int ProducedHep { get; set; }
        [JsonProperty("nameDisplay")] public string NameDisplay { get; set; }
        [JsonProperty("customName")] public string CustomName { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("ingredients")] public List<ComplexRecipeElementDto> Ingredients { get; set; } = new List<ComplexRecipeElementDto>();
        [JsonProperty("results")] public List<ComplexRecipeElementDto> Results { get; set; } = new List<ComplexRecipeElementDto>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }
    }

    public class DietInfoDto
    {
        [JsonProperty("consumedTags")] public List<string> ConsumedTags { get; set; } = new List<string>();
        [JsonProperty("producedElement")] public string ProducedElement { get; set; }
        [JsonProperty("kcalPerKg")] public float KcalPerKg { get; set; }
        [JsonProperty("producedConversionRate")] public float ProducedConversionRate { get; set; }
        [JsonProperty("foodType")] public string FoodType { get; set; }
        [JsonProperty("produceSolidTile")] public bool ProduceSolidTile { get; set; }
    }

    public class BreedingWeightDto
    {
        [JsonProperty("eggId")] public string EggId { get; set; }
        [JsonProperty("weight")] public float Weight { get; set; }
    }

    public class FertilityDto
    {
        [JsonProperty("baseFertileCycles")] public float BaseFertileCycles { get; set; }
        [JsonProperty("breedingWeights")] public List<BreedingWeightDto> BreedingWeights { get; set; } = new List<BreedingWeightDto>();
    }

    public class ShearableDto
    {
        [JsonProperty("kind")] public string Kind { get; set; }
        [JsonProperty("itemDropped")] public string ItemDropped { get; set; }
        [JsonProperty("dropMassKg")] public float DropMassKg { get; set; }
        [JsonProperty("growthCycles")] public float GrowthCycles { get; set; }
        [JsonProperty("targetAtmosphere")] public string TargetAtmosphere { get; set; }
        [JsonProperty("requiredDiet")] public string RequiredDiet { get; set; }
    }

    public class MilkProductionDto
    {
        [JsonProperty("element")] public string Element { get; set; }
        [JsonProperty("capacityKg")] public float CapacityKg { get; set; }
        [JsonProperty("caloriesPerCycle")] public float CaloriesPerCycle { get; set; }
    }

    public class ElementDropperDto
    {
        [JsonProperty("element")] public string Element { get; set; }
        [JsonProperty("massPerDropKg")] public float MassPerDropKg { get; set; }
        [JsonProperty("probabilityPercent")] public float ProbabilityPercent { get; set; }
        [JsonProperty("massReleaseOnDeathKg")] public float MassReleaseOnDeathKg { get; set; }
    }

    public class CritterDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("species")] public string Species { get; set; }
        [JsonProperty("isBaby")] public bool IsBaby { get; set; }
        [JsonProperty("adultPrefab")] public string AdultPrefab { get; set; }
        [JsonProperty("babyGrowCycles")] public float? BabyGrowCycles { get; set; }
        [JsonProperty("onGrowDropId")] public string OnGrowDropId { get; set; }
        [JsonProperty("onGrowDropUnits")] public float OnGrowDropUnits { get; set; }
        [JsonProperty("massKg")] public float MassKg { get; set; }
        [JsonProperty("kcalPerCycle")] public float? KcalPerCycle { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new List<string>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }

        [JsonProperty("diet")] public List<DietInfoDto> Diet { get; set; }
        [JsonProperty("fertility")] public FertilityDto Fertility { get; set; }
        [JsonProperty("shearables")] public List<ShearableDto> Shearables { get; set; }
        [JsonProperty("milkProduction")] public MilkProductionDto MilkProduction { get; set; }
        [JsonProperty("butcherDrops")] public Dictionary<string, float> ButcherDrops { get; set; }
        [JsonProperty("elementConverters")] public List<ElementConverterDto> ElementConverters { get; set; }
        [JsonProperty("elementConsumers")] public List<ElementConsumerDto> ElementConsumers { get; set; }
        [JsonProperty("elementEmitters")] public List<ElementEmitterDto> ElementEmitters { get; set; }
        [JsonProperty("elementDropper")] public ElementDropperDto ElementDropper { get; set; }
    }

    public class EggDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("massKg")] public float MassKg { get; set; }
        [JsonProperty("spawnedCreature")] public string SpawnedCreature { get; set; }
        [JsonProperty("baseIncubationCycles")] public float BaseIncubationCycles { get; set; }
        [JsonProperty("eggShellRatio")] public float EggShellRatio { get; set; }
        [JsonProperty("preventEggDrops")] public bool PreventEggDrops { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new List<string>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }
    }

    public class CropProductDto
    {
        [JsonProperty("cropId")] public string CropId { get; set; }
        [JsonProperty("quantity")] public float Quantity { get; set; }
    }

    public class CropDto
    {
        [JsonProperty("products")] public List<CropProductDto> Products { get; set; } = new List<CropProductDto>();
        [JsonProperty("cropDurationSec")] public float CropDurationSec { get; set; }
        [JsonProperty("cropDurationCycles")] public float CropDurationCycles { get; set; }
        [JsonProperty("renewable")] public bool Renewable { get; set; }
    }

    public class SeedProducerDto
    {
        [JsonProperty("seedId")] public string SeedId { get; set; }
        [JsonProperty("productionType")] public string ProductionType { get; set; }
        [JsonProperty("newSeedsProduced")] public int NewSeedsProduced { get; set; }
        [JsonProperty("seedDropChance")] public float SeedDropChance { get; set; }
    }

    public class CritterTrapDto
    {
        [JsonProperty("consumableTags")] public List<string> ConsumableTags { get; set; } = new List<string>();
        [JsonProperty("outputElement")] public string OutputElement { get; set; }
        [JsonProperty("gasOutputRateKgPerSec")] public float GasOutputRateKgPerSec { get; set; }
    }

    public class BranchGrowerDto
    {
        [JsonProperty("branchPrefabName")] public string BranchPrefabName { get; set; }
        [JsonProperty("maxBranchCount")] public int MaxBranchCount { get; set; }
    }

    public class SpaceTreeDto
    {
        [JsonProperty("optimalBranches")] public int OptimalBranches { get; set; }
        [JsonProperty("optimalProductionDurationSec")] public float OptimalProductionDurationSec { get; set; }
        [JsonProperty("productElement")] public string ProductElement { get; set; }
    }

    public class PlantDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new List<string>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }

        [JsonProperty("crop")] public CropDto Crop { get; set; }
        [JsonProperty("irrigation")] public List<RateElementDto> Irrigation { get; set; }
        [JsonProperty("fertilization")] public List<RateElementDto> Fertilization { get; set; }
        [JsonProperty("seedProducer")] public SeedProducerDto SeedProducer { get; set; }
        [JsonProperty("elementConverters")] public List<ElementConverterDto> ElementConverters { get; set; }
        [JsonProperty("elementConsumers")] public List<ElementConsumerDto> ElementConsumers { get; set; }
        [JsonProperty("elementEmitters")] public List<ElementEmitterDto> ElementEmitters { get; set; }
        [JsonProperty("sublimates")] public SublimatesDto Sublimates { get; set; }
        [JsonProperty("critterTrap")] public CritterTrapDto CritterTrap { get; set; }
        [JsonProperty("branchGrower")] public BranchGrowerDto BranchGrower { get; set; }
        [JsonProperty("spaceTree")] public SpaceTreeDto SpaceTree { get; set; }
    }

    public class SeedDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("plantId")] public string PlantId { get; set; }
        [JsonProperty("direction")] public string Direction { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new List<string>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }
    }

    public class DuplicantDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("oxygenKgPerSec")] public float OxygenKgPerSec { get; set; }
        [JsonProperty("o2ToCo2Conversion")] public float O2ToCo2Conversion { get; set; }
        [JsonProperty("co2KgPerSec")] public float Co2KgPerSec { get; set; }
        [JsonProperty("kcalPerCycle")] public float? KcalPerCycle { get; set; }
        [JsonProperty("peePerToiletKg")] public float? PeePerToiletKg { get; set; }
        [JsonProperty("baseWattage")] public float? BaseWattage { get; set; }
        [JsonProperty("oilKgPerSec")] public float? OilKgPerSec { get; set; }
        [JsonProperty("compatibleBatteryTags")] public List<string> CompatibleBatteryTags { get; set; }
        [JsonProperty("lubricantTags")] public List<string> LubricantTags { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new List<string>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
    }

    public class GeyserDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("geyserTypeId")] public string GeyserTypeId { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("element")] public string Element { get; set; }
        [JsonProperty("shape")] public string Shape { get; set; }
        [JsonProperty("temperatureC")] public float TemperatureC { get; set; }
        [JsonProperty("minRatePerCycleKg")] public float MinRatePerCycleKg { get; set; }
        [JsonProperty("maxRatePerCycleKg")] public float MaxRatePerCycleKg { get; set; }
        [JsonProperty("maxPressureKg")] public float MaxPressureKg { get; set; }
        [JsonProperty("minIterationLength")] public float MinIterationLength { get; set; }
        [JsonProperty("maxIterationLength")] public float MaxIterationLength { get; set; }
        [JsonProperty("minIterationPercent")] public float MinIterationPercent { get; set; }
        [JsonProperty("maxIterationPercent")] public float MaxIterationPercent { get; set; }
        [JsonProperty("minYearLength")] public float MinYearLength { get; set; }
        [JsonProperty("maxYearLength")] public float MaxYearLength { get; set; }
        [JsonProperty("minYearPercent")] public float MinYearPercent { get; set; }
        [JsonProperty("maxYearPercent")] public float MaxYearPercent { get; set; }
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }
    }

    public class ItemDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("massKg")] public float? MassKg { get; set; }
        [JsonProperty("electrobankCapacityJ")] public float? ElectrobankCapacityJ { get; set; }
        [JsonProperty("electrobankRechargeable")] public bool? ElectrobankRechargeable { get; set; }
        [JsonProperty("sublimates")] public SublimatesDto Sublimates { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new List<string>();
        [JsonProperty("requiredDlcIds")] public string[] RequiredDlcIds { get; set; }
        [JsonProperty("forbiddenDlcIds")] public string[] ForbiddenDlcIds { get; set; }
    }
}
