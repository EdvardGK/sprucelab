# User feedback stream — finish-line punch list (2026-05-16)

**Captured verbatim** so the user's framing stays authoritative. Translated to structured items in `docs/dev.md`. Reference back to this doc when a translation feels lossy.

---

## Cross-filter regression

> Treemap is not crossfiltering to viewer. Something is fundamentally off since I have said this a million times.

## Project rules editor + GIS site map

> We need a great, and I mean great, simple and intuitive project rules editor. The output: Verification rules, a map with the project scene, GIS style AND as an optional underlay in the model viewers. Models need to report of the requirements in the x/n KPI card and have the full list in the verification tab. Types need to be flagged if they dont meet requirements. MMI, classification and rules in general needs to be connected to:

## Event module + meetings + versioning lock

> The event module I've asked for many tiumes: Calendar, GANTT and Kanban + document/delivery table. I also need a meetings module and a versioning module connected to this. Maybe not a versions module pr se, but tracking/locking what versions that were valid/active at the time of an event.

## Sidebar reorg

> Clean up the sidebar into Files, Data, Project, Workspace (Project at the top with 3d viewer, Events, Meetings, Teams)

## Scopes — secondary project containers

> We also need to enable Scopes, where we add a secondary project container. Like we have LBK as the project, but LBK has Building A,B,C and will live for many years and be built by different teams, but the project management and support structure is the same for all. Could be different stages of a project as well. Like one architect team is in charge of early design, but a different one takes charge of the scaling to buildable drawings and details and coordinating with other disciplines etc. Early stage, design stage etc.

## Viewer — solid tool, not main product

> The viewer is really bad now. Need great UI, with HUDS, toolbars, intuitive filtering and aggregation of data. Clean and modern. The viewer is not the main product of sprucelab, but a bad viewer gets in the way. The viewer should just be a solid tool. We can be fancy about UI since thats not a viewer thing per se. Sprucelab is all about telling stories with data and visualizing and tracking data and making informed decisions. That means our product is the information and filtering, not the technical viewer. All I want from the viewer is a good sectioning tool, annotation with issue generation, clear data, excellent filtering, and with filtering comes isolating, hiding, applying color filters, etc.

## Project admin page

> We need to set up the admin page for the projects themselves. Invite, assign, set up etc. The project setup editor with rules etc should live here and be a limited visibility scope. The front facing part of the rules can be a EIR+BEP page in the Projects section of the Sidebar.

## My workspace

> We need to create "My workspace" as the individual user's workspace.

## Company workspaces

> We need to create "Company workspaces" that each company controls and is hard separated from any projects they participate in. A project can invite a company to join within a scope of roles and rights, and the company can decide when their work goes from WIP to Share. They need to be able to have templates, and buckets for projects inside their own org page. This has been described by me a few months ago, but not built.

## Materials overhaul

> The materials page needs an overhaul. Give components space to breathe and set up the basic grid based approach.

## Claims AI engine

> We need to set up the claims AI engine, so that we can drop in an API key to integrate with an LLM. We also need to set up the automatic calls or agents framework that will actually run the claims module.

## Drawings module fix

> We need to fix the Drawings module. Each dwg and pdf should be shown in a gallery, and you should be able to toggle between gallery and table view.

## Point clouds

> We need to add point clouds to files and integrate pointclouds in the viewer. A self contained points cloud viewer in that module + turn it on/off in the main viewer.

## Forward deployment

> We need to fix the forward deployment idea of hosting on sprucelab, but allowing humans or agents to display dashboards and data in other custom tools and websites. Webhooks etc.

## Integrations (design-with-in-mind only — no real work pending)

> We need to be ready to integrate with autodesk, dalux, solibri, speckle, BCF servers, Reduzer (might be the most important as I already work with them and many of my ideas have been generated from my experiences working with their platform. Its very bad at working with data and models, but they have the core functionality of owning the LCA reporting and having great insights and reporting on that. Sprucelab is way better at parsing and cleaning data to be integrated with reduzer for formalized and QA/QC LCA reporting and simply access to verified datasets and EPDs). Other interesting partners: Propely, Cobuilder, Diplom). This is only about designing with this in mind, as this requires relationship building in the real world.
