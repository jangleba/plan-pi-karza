CREATE POLICY "Vision videos are readable by owner"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'vision-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Vision videos are insertable by owner"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'vision-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Vision videos are updatable by owner"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'vision-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Vision videos are deletable by owner"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'vision-videos' AND (storage.foldername(name))[1] = auth.uid()::text);