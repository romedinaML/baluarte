import { runQuery } from "./db.js";

export async function linkLayoutChild(
  layoutId: string,
  childId: string,
  childType: "molecule" | "atom",
  childProperty: string | null = null,
): Promise<void> {
  await runQuery("link_layout_child.sql", {
    layout_id: layoutId,
    child_id: childId,
    child_type: childType,
    child_property: childProperty,
  });
}

export async function linkLayoutProperty(
  layoutId: string,
  propertyId: string,
): Promise<void> {
  await runQuery("link_layout_property.sql", {
    layout_id: layoutId,
    property_id: propertyId,
  });
}

export async function linkMoleculeChild(
  moleculeId: string,
  childId: string,
  propertyId: string | null = null,
): Promise<void> {
  await runQuery("link_molecule_child.sql", {
    molecule_id: moleculeId,
    child_id: childId,
    property_id: propertyId,
  });
}

export async function linkMoleculeProperty(
  moleculeId: string,
  propertyId: string,
  stateId: string,
): Promise<void> {
  await runQuery("link_molecule_property.sql", {
    molecule_id: moleculeId,
    property_id: propertyId,
    state_id: stateId,
  });
}

export async function linkAtomProperty(
  atomId: string,
  propertyId: string,
  stateId: string,
): Promise<void> {
  await runQuery("link_atom_property.sql", {
    atom_id: atomId,
    property_id: propertyId,
    state_id: stateId,
  });
}

export async function deleteLayoutRegistryByLayout(
  layoutId: string,
): Promise<void> {
  await runQuery("delete_layout_registry_by_layout.sql", {
    layout_id: layoutId,
  });
}

export async function deleteMoleculesRegistryByMolecule(
  moleculeId: string,
): Promise<void> {
  await runQuery("delete_molecules_registry_by_molecule.sql", {
    molecule_id: moleculeId,
  });
}
