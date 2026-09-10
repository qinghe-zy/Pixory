<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Path to store the counter
$counter_file = __DIR__ . '/counter.txt';

// Open the file with exclusive lock for safe concurrent updates
$fp = fopen($counter_file, 'c+');
if (flock($fp, LOCK_EX)) {
    // Read current counter
    $counter = (int) fread($fp, 1024);
    
    // Increment counter
    $counter++;
    
    // Convert to AAA-001 format
    $num = $counter % 1000;
    $alpha_val = intdiv($counter, 1000);
    
    $c3 = chr(65 + ($alpha_val % 26));
    $alpha_val = intdiv($alpha_val, 26);
    $c2 = chr(65 + ($alpha_val % 26));
    $alpha_val = intdiv($alpha_val, 26);
    $c1 = chr(65 + ($alpha_val % 26));
    
    // Format numeric part to 3 digits
    $formatted_num = str_pad($num, 3, "0", STR_PAD_LEFT);
    $new_id = "{$c1}{$c2}{$c3}-{$formatted_num}";
    
    // Write new counter back to file
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, $counter);
    
    // Release lock and close
    flock($fp, LOCK_UN);
    fclose($fp);
    
    echo json_encode([
        'success' => true,
        'id' => $new_id
    ]);
} else {
    fclose($fp);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server busy']);
}
?>
