-- Gym templates A/B/C as they were on 5 Oct 2026, before the Base program was loaded.
-- Run in the Supabase SQL editor to go back. Note: logged sets made with the new
-- template rows lose their template link (history and weights stay).
begin;
delete from template_exercises where template_id in ('c6bac97b-43e6-4f41-be41-ce4fc93a6955','386e48e6-1cbd-49eb-9649-fea9b2258d66','d233a075-a605-4c2a-8b7f-781908050aec');
insert into template_exercises (id, user_id, template_id, exercise_id, block, position, sets, rep_min, rep_max, target_rir, rest_seconds, notes) values
-- Full body B
('10e63105-1169-4dbb-8017-750a47877b9e','fae76b55-46c7-410d-b348-1f7daf7ffd00','386e48e6-1cbd-49eb-9649-fea9b2258d66','cbe08698-ccfa-4fb6-8b8c-a55cfa519a09','finisher',7,3,null,null,null,null,null),
('c742bd31-8b55-4c1a-b5e7-9a74ca2942c2','fae76b55-46c7-410d-b348-1f7daf7ffd00','386e48e6-1cbd-49eb-9649-fea9b2258d66','f96ff5d4-2624-4a18-ab54-f10795df1714','finisher',8,3,null,null,null,null,null),
('bf1b1721-686f-4ff9-855e-56e93073075a','fae76b55-46c7-410d-b348-1f7daf7ffd00','386e48e6-1cbd-49eb-9649-fea9b2258d66','c53acaaa-7057-447f-a237-4a48c751e30b','main',1,4,null,null,null,null,null),
('de484f5a-c8a2-40b2-a2df-3e6faea65f52','fae76b55-46c7-410d-b348-1f7daf7ffd00','386e48e6-1cbd-49eb-9649-fea9b2258d66','7116cadd-6e9f-4827-9de8-b416e82944b7','main',2,4,null,null,null,null,null),
('3e736f2d-def5-4a56-a417-1a99ed42a134','fae76b55-46c7-410d-b348-1f7daf7ffd00','386e48e6-1cbd-49eb-9649-fea9b2258d66','ee27ff49-f175-4308-86ae-d28b3fe13565','main',3,3,null,null,null,null,null),
('444392b6-8216-4c5d-b888-7171a944321e','fae76b55-46c7-410d-b348-1f7daf7ffd00','386e48e6-1cbd-49eb-9649-fea9b2258d66','e02ec427-65b6-4531-b20e-0d7ef22b968f','main',4,3,null,null,null,null,null),
('39e5b9c9-2e9e-4f67-a517-03ff4fc271ac','fae76b55-46c7-410d-b348-1f7daf7ffd00','386e48e6-1cbd-49eb-9649-fea9b2258d66','3a43d63d-e6cc-495f-ba04-eb84a3baebb0','main',5,4,null,null,null,null,null),
('53187582-f7db-47f8-be60-a88ce3c81362','fae76b55-46c7-410d-b348-1f7daf7ffd00','386e48e6-1cbd-49eb-9649-fea9b2258d66','b6bbc452-a625-4d91-94ba-ab25bf8c8ee6','main',6,3,null,null,null,null,null),
-- Full body A
('b8c558d8-250f-475c-a0ce-a917fd32efa2','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','101be0e5-d7b6-475d-91ec-f9c09327b7d3','finisher',7,3,null,null,null,null,null),
('5e51cf12-0493-4b10-b177-25224f9d3f86','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','179bfd1f-d674-4a5a-8594-cb04d672fc81','finisher',8,3,null,null,null,null,null),
('39f4a405-7531-41f9-bbd1-63e389413155','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','7203f088-ef73-4104-8930-d29629dcc66b','finisher',9,3,null,null,null,null,null),
('54c8733f-e0fb-470b-b99b-a856913d818b','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','313da6f7-af46-4604-8f27-ec11636fc74d','finisher',10,3,null,null,null,null,null),
('c64562e9-43c0-49bf-9919-2f1b00b78487','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','4bd128f9-b362-424d-b96d-6786a70ac897','main',1,4,null,null,null,null,null),
('3c5c3e5c-0f34-46e9-bb44-efae8019ffaf','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','e50bf4b8-500f-4a63-9b5f-9f9516e557c9','main',2,4,null,null,null,null,null),
('9f43a11e-a922-4fd2-9d75-12f8a1db67fa','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','ad385701-a610-4bbd-af99-131aee5f952c','main',3,3,null,null,null,null,null),
('c3097069-ab4a-4ff4-9e5d-3c86787f2736','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','51654f26-d138-4f0e-8859-8f7905400041','main',4,3,null,null,null,null,null),
('b36a96e3-e663-4201-9814-377d07bdbec4','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','0e35cffc-afc3-480c-ab31-c87cc9c453c8','main',5,3,null,null,null,null,null),
('7ee7ff38-804b-4c1c-9954-87e77c20ad87','fae76b55-46c7-410d-b348-1f7daf7ffd00','c6bac97b-43e6-4f41-be41-ce4fc93a6955','7086a6f9-e802-4c7f-96fe-76fe044a894e','main',6,4,null,null,null,null,null),
-- Full body C
('6a888eed-3d49-4e79-a124-40e93588681b','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','97bcbaf4-b217-4e1f-9673-194674400449','finisher',8,3,null,null,null,null,null),
('36e5e956-caf8-4ae7-82e8-49315fa4293f','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','fe5e4fb2-89e2-4979-84f2-1ab518e0a3fd','finisher',9,3,null,null,null,null,null),
('76044f2c-ff30-41bd-a14e-955be27fe47a','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','101be0e5-d7b6-475d-91ec-f9c09327b7d3','finisher',10,3,null,null,null,null,null),
('b07404c1-fc6a-484d-960d-194d4c189994','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','e910aa65-1b98-4f49-a46f-3ec8b6121eae','main',1,4,null,null,null,null,null),
('86a3a9e9-dcc4-4cf0-8413-7a3a68f32709','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','69f0150f-d426-413e-b4c1-3a0386afad3b','main',2,4,null,null,null,null,null),
('1ccd202d-4d5b-42bf-90a4-04595bb52e22','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','0e35cffc-afc3-480c-ab31-c87cc9c453c8','main',3,3,null,null,null,null,null),
('95e2b40e-6f17-49bb-86c6-c2155925b1ce','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','2b01305d-8d11-4502-b004-22bcd22d2b16','main',4,3,null,null,null,null,null),
('f98c3ecb-e21b-40ba-a32b-ddbef0aee730','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','bf30dd9d-a668-4733-9554-f13d9b58662d','main',5,3,null,null,null,null,null),
('44d392fb-426c-414d-b8e3-c0e4c3d0c9e9','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','b90c30ce-5cee-478f-a11d-8ae377f5bcb3','main',6,4,null,null,null,null,null),
('a3144fe0-6016-4fd4-9543-4ef134c877b5','fae76b55-46c7-410d-b348-1f7daf7ffd00','d233a075-a605-4c2a-8b7f-781908050aec','0fe02c9a-cade-4ddc-b677-b484ccc1db7e','main',7,4,null,null,null,null,null);
commit;
