function onKeyEvent(context, key)
  if key:isRelease() then
      return false
  end

  print("Key Pressed:", key)  -- 输出按键信息

  if key:isDigit() and key:getDigit() == 0 then
      print("Matched 0 key")  -- 输出匹配信息

      -- 调试候选过滤逻辑
      context:setFilter(function(c)
          local is_single = utf8.len(c.text) == 1
          print("Candidate:", c.text, "Is Single Character:", is_single)
          return is_single
      end)
      return true
  end
  return false
end
