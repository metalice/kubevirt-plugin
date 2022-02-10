#!/bin/bash
if [[ -f extentions.txt ]]
then
while IFS=\= read extensions; do
    extensions+=($extensions)
done < extentions.txt
for i in ${extensions[@]}
do
	code --install-extension $i
done
else
    echo 'file not found'
fi