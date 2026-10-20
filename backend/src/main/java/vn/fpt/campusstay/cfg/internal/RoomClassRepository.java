package vn.fpt.campusstay.cfg.internal;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface RoomClassRepository extends JpaRepository<RoomClassEntity, Long> {

    @Query("select c from RoomClassEntity c where lower(c.name) = lower(:name)")
    Optional<RoomClassEntity> findByNameIgnoreCase(@Param("name") String name);

    @Query("select coalesce(max(c.sortOrder), 0) from RoomClassEntity c")
    int maxSortOrder();

    @Query("select c from RoomClassEntity c order by c.sortOrder, c.name")
    List<RoomClassEntity> findAllOrdered();
}
