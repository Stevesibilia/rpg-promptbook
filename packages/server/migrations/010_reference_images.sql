-- Reference images for board image generation (openspec change
-- reference-images, D10): how many reference images each image was asked
-- with; rows written before read 0.
alter table image_generations
  add column reference_count smallint not null default 0
  check (reference_count >= 0);
